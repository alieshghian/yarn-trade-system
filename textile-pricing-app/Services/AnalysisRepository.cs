using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class AnalysisRepository
{
    private readonly string _databasePath;
    private readonly string _seedPath;
    private readonly AuditLogRepository _auditLogs;
    private readonly MaterialRepository _materials;
    private readonly object _gate = new();
    private bool _initialized;

    public AnalysisRepository(IWebHostEnvironment environment, AuditLogRepository auditLogs, MaterialRepository materials)
    {
        _databasePath = Path.Combine(environment.ContentRootPath, "App_Data", "pricing.db");
        _seedPath = Path.Combine(environment.ContentRootPath, "Data", "seed.json");
        _auditLogs = auditLogs;
        _materials = materials;
    }

    public IReadOnlyList<ProductRecipe> GetAll(string? query = null, int? take = null)
    {
        EnsureInitialized();

        var recipes = new List<ProductRecipe>();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Code, Name, ProductGroupName, ImagePath, ProfitCategoryName, WasteCategoryName, ProductType, WarpDensity, WeftDensity, WeftCount, DyeType, LayerType, ChainType, GramPerMeter, FaceGramPerMeter, LiningGramPerMeter, ProductStatus, BrushingMode, FinishingType, ContainerMeters, MeasurementUnit, LaminationOrigin, ProductPurchasePrice
            FROM ProductRecipes
            WHERE $query IS NULL
                OR Code LIKE '%' || $query || '%'
                OR Name LIKE '%' || $query || '%'
                OR ProductGroupName LIKE '%' || $query || '%'
            ORDER BY Code
            LIMIT $limit
            """;
        command.Parameters.AddWithValue("$query", string.IsNullOrWhiteSpace(query) ? DBNull.Value : query.Trim());
        command.Parameters.AddWithValue("$limit", take ?? 5000);

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            recipes.Add(ReadRecipeHeader(reader));
        }

        foreach (var recipe in recipes)
        {
            recipe.Components = GetComponents(recipe.Id).ToList();
        }

        return recipes;
    }

    public ProductRecipe? GetById(int id)
    {
        EnsureInitialized();

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Code, Name, ProductGroupName, ImagePath, ProfitCategoryName, WasteCategoryName, ProductType, WarpDensity, WeftDensity, WeftCount, DyeType, LayerType, ChainType, GramPerMeter, FaceGramPerMeter, LiningGramPerMeter, ProductStatus, BrushingMode, FinishingType, ContainerMeters, MeasurementUnit, LaminationOrigin, ProductPurchasePrice
            FROM ProductRecipes
            WHERE Id = $id
            """;
        command.Parameters.AddWithValue("$id", id);

        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }

        var recipe = ReadRecipeHeader(reader);
        recipe.Components = GetComponents(recipe.Id).ToList();
        return recipe;
    }

    public IReadOnlyDictionary<string, int> GetRuleComponentMappings(int productRecipeId)
    {
        EnsureInitialized();
        var existingComponentIds = GetComponents(productRecipeId)
            .Select(component => component.Id)
            .ToHashSet();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT NewValue, EntityId, Operation
            FROM AuditLogs
            WHERE EntityType = 'ردیف‌های Rule Engine'
              AND FieldName = 'RowKey'
              AND EntityId LIKE $prefix
            ORDER BY Id DESC
            """;
        command.Parameters.AddWithValue("$prefix", $"{productRecipeId}:%");
        using var reader = command.ExecuteReader();
        var result = new Dictionary<string, int>(StringComparer.Ordinal);
        var resolvedRows = new HashSet<string>(StringComparer.Ordinal);
        while (reader.Read())
        {
            var rowKey = reader.GetString(0).Trim();
            var entityId = reader.GetString(1);
            var operation = reader.GetString(2);
            var separator = entityId.LastIndexOf(':');
            if (!string.IsNullOrWhiteSpace(rowKey) &&
                resolvedRows.Add(rowKey) &&
                !string.Equals(operation, "حذف", StringComparison.Ordinal) &&
                separator >= 0 &&
                int.TryParse(entityId[(separator + 1)..], NumberStyles.Integer, CultureInfo.InvariantCulture, out var componentId) &&
                existingComponentIds.Contains(componentId))
            {
                result[rowKey] = componentId;
            }
        }

        return result;
    }

    public IReadOnlyDictionary<string, string> GetRuleComponentNotes(int productRecipeId)
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT EntityId, NewValue
            FROM AuditLogs
            WHERE EntityType = 'ردیف‌های Rule Engine'
              AND FieldName = 'ملاحظات'
              AND EntityId LIKE $prefix
            ORDER BY Id DESC
            """;
        command.Parameters.AddWithValue("$prefix", $"{productRecipeId}:%");
        using var reader = command.ExecuteReader();
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        while (reader.Read())
        {
            var entityId = reader.GetString(0);
            var separator = entityId.IndexOf(':');
            var rowKey = separator >= 0 ? entityId[(separator + 1)..] : "";
            if (!string.IsNullOrWhiteSpace(rowKey) && !result.ContainsKey(rowKey))
            {
                result[rowKey] = reader.GetString(1);
            }
        }

        return result;
    }

    public void SaveRuleComponentNote(int productRecipeId, string rowKey, string? note)
    {
        EnsureInitialized();
        var recipe = GetById(productRecipeId);
        if (recipe is null || string.IsNullOrWhiteSpace(rowKey))
        {
            return;
        }

        var normalizedNote = note?.Trim() ?? "";
        var oldNote = GetRuleComponentNotes(productRecipeId).GetValueOrDefault(rowKey, "");
        if (string.Equals(oldNote, normalizedNote, StringComparison.Ordinal))
        {
            return;
        }

        _auditLogs.Add(AuditLogRepository.Create(
            "آنالیز محصولات",
            "ردیف‌های Rule Engine",
            $"{productRecipeId}:{rowKey}",
            recipe.Code,
            "ملاحظات",
            oldNote,
            normalizedNote,
            "ثبت",
            "Text",
            "Analyses"));
    }

    public ProductRecipe? GetByCode(string code)
    {
        EnsureInitialized();

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Code, Name, ProductGroupName, ImagePath, ProfitCategoryName, WasteCategoryName, ProductType, WarpDensity, WeftDensity, WeftCount, DyeType, LayerType, ChainType, GramPerMeter, FaceGramPerMeter, LiningGramPerMeter, ProductStatus, BrushingMode, FinishingType, ContainerMeters, MeasurementUnit, LaminationOrigin, ProductPurchasePrice
            FROM ProductRecipes
            WHERE Code = $code
            """;
        command.Parameters.AddWithValue("$code", code);

        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }

        var recipe = ReadRecipeHeader(reader);
        recipe.Components = GetComponents(recipe.Id).ToList();
        return recipe;
    }

    public IReadOnlyList<string> GetProductGroups()
    {
        EnsureInitialized();

        var groups = new List<string>();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT DISTINCT ProductGroupName
            FROM ProductRecipes
            WHERE ProductGroupName <> ''
            ORDER BY ProductGroupName
            """;

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            groups.Add(reader.GetString(0));
        }

        return groups;
    }

    public int Save(ProductRecipeInput input)
    {
        EnsureInitialized();
        var old = input.Id > 0 ? GetById(input.Id) : null;

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();

        if (input.Id > 0)
        {
            command.CommandText = """
                UPDATE ProductRecipes
                SET Code = $code,
                    Name = $name,
                    ProductGroupName = $productGroupName,
                    ImagePath = $imagePath,
                    ProfitCategoryName = $profitCategoryName,
                    WasteCategoryName = $wasteCategoryName,
                    ProductType = $productType,
                    ProductStatus = $productStatus,
                    MeasurementUnit = $measurementUnit,
                    LaminationOrigin = $laminationOrigin,
                    WarpDensity = $warpDensity,
                    WeftDensity = $weftDensity,
                    WeftCount = $weftCount,
                    DyeType = $dyeType,
                    LayerType = $layerType,
                    ChainType = $chainType,
                    GramPerMeter = $gramPerMeter,
                    FaceGramPerMeter = $faceGramPerMeter,
                    LiningGramPerMeter = $liningGramPerMeter,
                    BrushingMode = $brushingMode,
                    FinishingType = $finishingType,
                    ContainerMeters = $containerMeters,
                    ProductPurchasePrice = $productPurchasePrice
                WHERE Id = $id
                """;
            command.Parameters.AddWithValue("$id", input.Id);
            AddRecipeParameters(command, input);
            command.ExecuteNonQuery();
            _auditLogs.AddMany(BuildRecipeLogs(old, GetById(input.Id), "ویرایش"));
            return input.Id;
        }

        command.CommandText = """
            INSERT INTO ProductRecipes (Code, Name, ProductGroupName, ImagePath, ProfitCategoryName, WasteCategoryName, ProductType, ProductStatus, MeasurementUnit, LaminationOrigin, WarpDensity, WeftDensity, WeftCount, DyeType, LayerType, ChainType, GramPerMeter, FaceGramPerMeter, LiningGramPerMeter, BrushingMode, FinishingType, ContainerMeters, ProductPurchasePrice)
            VALUES ($code, $name, $productGroupName, $imagePath, $profitCategoryName, $wasteCategoryName, $productType, $productStatus, $measurementUnit, $laminationOrigin, $warpDensity, $weftDensity, $weftCount, $dyeType, $layerType, $chainType, $gramPerMeter, $faceGramPerMeter, $liningGramPerMeter, $brushingMode, $finishingType, $containerMeters, $productPurchasePrice);
            SELECT last_insert_rowid();
        """;
        AddRecipeParameters(command, input);
        var id = Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture);
        _auditLogs.AddMany(BuildRecipeLogs(null, GetById(id), "ثبت"));
        return id;
    }

    public void DeleteRecipe(int id)
    {
        EnsureInitialized();
        var old = GetById(id);

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        using var deleteComponents = connection.CreateCommand();
        deleteComponents.Transaction = transaction;
        deleteComponents.CommandText = "DELETE FROM ProductComponents WHERE ProductRecipeId = $id";
        deleteComponents.Parameters.AddWithValue("$id", id);
        deleteComponents.ExecuteNonQuery();

        using var deleteRecipe = connection.CreateCommand();
        deleteRecipe.Transaction = transaction;
        deleteRecipe.CommandText = "DELETE FROM ProductRecipes WHERE Id = $id";
        deleteRecipe.Parameters.AddWithValue("$id", id);
        deleteRecipe.ExecuteNonQuery();
        transaction.Commit();
        _auditLogs.AddMany(BuildRecipeLogs(old, null, "حذف"));
    }

    public int AddComponent(ProductComponentInput input)
    {
        EnsureInitialized();
        var recipe = GetById(input.ProductRecipeId);
        var material = GetMaterialByName(input.MaterialName);

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO ProductComponents (ProductRecipeId, MaterialId, MaterialName, Quantity)
            VALUES ($productRecipeId, $materialId, $materialName, $quantity)
            """;
        command.Parameters.AddWithValue("$productRecipeId", input.ProductRecipeId);
        command.Parameters.AddWithValue("$materialId", material?.Id is > 0 ? material.Id : (object)DBNull.Value);
        command.Parameters.AddWithValue("$materialName", material?.Name ?? input.MaterialName.Trim());
        command.Parameters.AddWithValue("$quantity", StoreDecimal(input.Quantity));
        command.ExecuteNonQuery();
        using var idCommand = connection.CreateCommand();
        idCommand.CommandText = "SELECT last_insert_rowid()";
        var id = Convert.ToInt32(idCommand.ExecuteScalar(), CultureInfo.InvariantCulture);
        var entityId = $"{input.ProductRecipeId}:{id}";
        var entityName = $"{recipe?.Code ?? input.ProductRecipeId.ToString(CultureInfo.InvariantCulture)} / {input.MaterialName.Trim()}";
        _auditLogs.AddMany(
        [
            AuditLogRepository.Create("آنالیز محصولات", "قلم مصرفی محصول", entityId, entityName, "کالا/خدمت", null, input.MaterialName.Trim(), "ثبت", "Text", "Analyses"),
            AuditLogRepository.CreateDecimal("آنالیز محصولات", "قلم مصرفی محصول", entityId, entityName, "مقدار مصرف", null, input.Quantity, "ثبت", "Number", "Analyses")
        ]);
        return id;
    }

    public int SaveRuleComponents(
        int productRecipeId,
        IEnumerable<AnalysisRuleComponentSaveItem> items)
    {
        EnsureInitialized();
        var recipe = GetById(productRecipeId);
        if (recipe is null)
        {
            return 0;
        }

        var existing = recipe.Components.ToDictionary(component => component.Id);
        var existingMappings = GetRuleComponentMappings(productRecipeId);
        var normalized = items
            .Where(item => item.MaterialId > 0 && item.StoredQuantity > 0)
            .Select(item =>
            {
                var material = _materials.GetById(item.MaterialId);
                return material is null
                    ? null
                    : item with
                    {
                        MaterialName = material.Name.Trim(),
                        StoredQuantity = decimal.Round(item.StoredQuantity, 6, MidpointRounding.AwayFromZero),
                        Notes = item.Notes.Trim()
                    };
            })
            .Where(item => item is not null)
            .Cast<AnalysisRuleComponentSaveItem>()
            .ToList();

        if (normalized.Count == 0)
        {
            return 0;
        }

        var changed = 0;
        // A stale mapping can point multiple rule rows at the same component.
        // Never let a later row overwrite a component already used by this save.
        var claimedComponentIds = new HashSet<int>();
        var mappingsToAudit = new List<(string RowKey, int ComponentId, string MaterialName)>();
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        foreach (var item in normalized)
        {
            var targetComponentId = item.ExistingComponentId;
            if ((targetComponentId is null or <= 0 || !existing.ContainsKey(targetComponentId.Value)) &&
                existingMappings.TryGetValue(item.RowKey, out var mappedComponentId) &&
                existing.ContainsKey(mappedComponentId) &&
                !claimedComponentIds.Contains(mappedComponentId))
            {
                targetComponentId = mappedComponentId;
            }

            if (targetComponentId is > 0 && claimedComponentIds.Contains(targetComponentId.Value))
            {
                targetComponentId = null;
            }

            if (targetComponentId is > 0 &&
                existing.TryGetValue(targetComponentId.Value, out var old))
            {
                claimedComponentIds.Add(old.Id);
                if (old.MaterialId == item.MaterialId &&
                    old.Quantity == item.StoredQuantity &&
                    string.Equals(old.MaterialName.Trim(), item.MaterialName, StringComparison.CurrentCultureIgnoreCase))
                {
                    if (!existingMappings.TryGetValue(item.RowKey, out var mappedId) || mappedId != old.Id)
                    {
                        mappingsToAudit.Add((item.RowKey, old.Id, item.MaterialName));
                    }
                    continue;
                }

                using var update = connection.CreateCommand();
                update.Transaction = transaction;
                update.CommandText = """
                    UPDATE ProductComponents
                    SET MaterialId = $materialId,
                        MaterialName = $materialName,
                        Quantity = $quantity
                    WHERE Id = $id AND ProductRecipeId = $productRecipeId
                    """;
                update.Parameters.AddWithValue("$materialId", item.MaterialId);
                update.Parameters.AddWithValue("$materialName", item.MaterialName);
                update.Parameters.AddWithValue("$quantity", StoreDecimal(item.StoredQuantity));
                update.Parameters.AddWithValue("$id", targetComponentId.Value);
                update.Parameters.AddWithValue("$productRecipeId", productRecipeId);
                changed += update.ExecuteNonQuery();
                if (!existingMappings.TryGetValue(item.RowKey, out var updatedMappedId) || updatedMappedId != old.Id)
                {
                    mappingsToAudit.Add((item.RowKey, old.Id, item.MaterialName));
                }
                continue;
            }

            using var insert = connection.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText = """
                INSERT INTO ProductComponents (ProductRecipeId, MaterialId, MaterialName, Quantity)
                VALUES ($productRecipeId, $materialId, $materialName, $quantity)
                """;
            insert.Parameters.AddWithValue("$productRecipeId", productRecipeId);
            insert.Parameters.AddWithValue("$materialId", item.MaterialId);
            insert.Parameters.AddWithValue("$materialName", item.MaterialName);
            insert.Parameters.AddWithValue("$quantity", StoreDecimal(item.StoredQuantity));
            changed += insert.ExecuteNonQuery();
            using var idCommand = connection.CreateCommand();
            idCommand.Transaction = transaction;
            idCommand.CommandText = "SELECT last_insert_rowid()";
            var insertedId = Convert.ToInt32(idCommand.ExecuteScalar(), CultureInfo.InvariantCulture);
            claimedComponentIds.Add(insertedId);
            mappingsToAudit.Add((item.RowKey, insertedId, item.MaterialName));
        }

        transaction.Commit();
        if (changed > 0)
        {
            _auditLogs.Add(AuditLogRepository.Create(
                "آنالیز محصولات",
                "ردیف‌های Rule Engine",
                productRecipeId.ToString(CultureInfo.InvariantCulture),
                recipe.Code,
                "ثبت کنترل‌شده ردیف‌ها",
                "",
                $"{changed} ردیف",
                "ثبت",
                "Text",
                "Analyses"));
        }

        if (mappingsToAudit.Count > 0)
        {
            _auditLogs.AddMany(mappingsToAudit.Select(mapping => AuditLogRepository.Create(
                "آنالیز محصولات",
                "ردیف‌های Rule Engine",
                $"{productRecipeId}:{mapping.ComponentId}",
                $"{recipe.Code} / {mapping.MaterialName}",
                "RowKey",
                "",
                mapping.RowKey,
                "ثبت",
                "Text",
                "Analyses")));
        }

        return changed;
    }

    public bool DeleteMappedRuleComponent(int productRecipeId, string rowKey)
    {
        EnsureInitialized();
        var recipe = GetById(productRecipeId);
        var mappings = GetRuleComponentMappings(productRecipeId);
        if (recipe is null || !mappings.TryGetValue(rowKey, out var componentId))
        {
            return false;
        }

        var component = recipe.Components.FirstOrDefault(item => item.Id == componentId);
        if (component is null)
        {
            return false;
        }

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM ProductComponents WHERE Id = $id AND ProductRecipeId = $productRecipeId";
        command.Parameters.AddWithValue("$id", componentId);
        command.Parameters.AddWithValue("$productRecipeId", productRecipeId);
        if (command.ExecuteNonQuery() == 0)
        {
            return false;
        }

        var entityId = $"{productRecipeId}:{componentId}";
        var entityName = $"{recipe.Code} / {component.MaterialName}";
        _auditLogs.AddMany(
        [
            AuditLogRepository.Create(
                "آنالیز محصولات",
                "قلم مصرفی محصول",
                entityId,
                entityName,
                "آیتم اختیاری آیرو",
                component.MaterialName,
                "",
                "حذف",
                "Text",
                "Analyses",
                "ردیف اختیاری آیرو تکمیل نشده بود"),
            AuditLogRepository.Create(
                "آنالیز محصولات",
                "ردیف‌های Rule Engine",
                entityId,
                entityName,
                "RowKey",
                rowKey,
                rowKey,
                "حذف",
                "Text",
                "Analyses",
                "حذف کامل نگاشت ردیف خودکار")
        ]);
        return true;
    }

    public int ReplaceComponentsFromProduct(int targetProductId, int sourceProductId)
    {
        EnsureInitialized();

        if (targetProductId <= 0 || sourceProductId <= 0 || targetProductId == sourceProductId)
        {
            return 0;
        }

        var sourceComponents = GetComponents(sourceProductId);
        var targetRecipe = GetById(targetProductId);
        var sourceRecipe = GetById(sourceProductId);
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        using var deleteTargetComponents = connection.CreateCommand();
        deleteTargetComponents.Transaction = transaction;
        deleteTargetComponents.CommandText = "DELETE FROM ProductComponents WHERE ProductRecipeId = $targetProductId";
        deleteTargetComponents.Parameters.AddWithValue("$targetProductId", targetProductId);
        deleteTargetComponents.ExecuteNonQuery();

        foreach (var component in sourceComponents)
        {
            using var insertComponent = connection.CreateCommand();
            insertComponent.Transaction = transaction;
            insertComponent.CommandText = """
                INSERT INTO ProductComponents (ProductRecipeId, MaterialId, MaterialName, Quantity)
                VALUES ($productRecipeId, $materialId, $materialName, $quantity)
                """;
            insertComponent.Parameters.AddWithValue("$productRecipeId", targetProductId);
            insertComponent.Parameters.AddWithValue("$materialId", component.MaterialId is > 0 ? component.MaterialId.Value : (object)DBNull.Value);
            insertComponent.Parameters.AddWithValue("$materialName", component.MaterialName.Trim());
            insertComponent.Parameters.AddWithValue("$quantity", StoreDecimal(component.Quantity));
            insertComponent.ExecuteNonQuery();
        }

        transaction.Commit();
        _auditLogs.Add(AuditLogRepository.Create("آنالیز محصولات", "اقلام مصرفی محصول", targetProductId.ToString(CultureInfo.InvariantCulture), targetRecipe?.Code ?? targetProductId.ToString(CultureInfo.InvariantCulture), "کپی اقلام مصرفی", "", $"{sourceComponents.Count} قلم از {sourceRecipe?.Code ?? sourceProductId.ToString(CultureInfo.InvariantCulture)}", "کپی", "Text", "Analyses"));
        return sourceComponents.Count;
    }

    public int UpdateComponentQuantities(int productRecipeId, IEnumerable<ProductComponentQuantityInput> inputs)
    {
        EnsureInitialized();
        var existing = GetComponents(productRecipeId).ToDictionary(item => item.Id);
        var normalizedInputs = inputs
            .Where(input => existing.ContainsKey(input.Id))
            .Select(input => new ProductComponentQuantityInput
            {
                Id = input.Id,
                MaterialName = input.MaterialName.Trim(),
                Quantity = decimal.Round(Math.Max(0, input.Quantity), 6, MidpointRounding.AwayFromZero)
            })
            .Where(input => input.Quantity > 0 &&
                (input.Quantity != existing[input.Id].Quantity ||
                 (!string.IsNullOrWhiteSpace(input.MaterialName) &&
                  !string.Equals(input.MaterialName.Trim(), existing[input.Id].MaterialName.Trim(), StringComparison.CurrentCultureIgnoreCase))))
            .ToList();

        if (normalizedInputs.Count == 0)
        {
            return 0;
        }

        var recipe = GetById(productRecipeId);
        var auditItems = new List<AuditLogInput>();
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        foreach (var input in normalizedInputs)
        {
            var old = existing[input.Id];
            var material = string.IsNullOrWhiteSpace(input.MaterialName)
                ? null
                : GetMaterialByName(input.MaterialName);
            var newMaterialName = material?.Name ?? (string.IsNullOrWhiteSpace(input.MaterialName) ? old.MaterialName : input.MaterialName.Trim());
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                UPDATE ProductComponents
                SET MaterialId = $materialId,
                    MaterialName = $materialName,
                    Quantity = $quantity
                WHERE Id = $id AND ProductRecipeId = $productRecipeId
                """;
            command.Parameters.AddWithValue("$materialId", material?.Id is > 0 ? material.Id : (object)DBNull.Value);
            command.Parameters.AddWithValue("$materialName", newMaterialName);
            command.Parameters.AddWithValue("$quantity", StoreDecimal(input.Quantity));
            command.Parameters.AddWithValue("$id", input.Id);
            command.Parameters.AddWithValue("$productRecipeId", productRecipeId);
            command.ExecuteNonQuery();

            var entityId = $"{productRecipeId}:{input.Id}";
            var entityName = $"{recipe?.Code ?? productRecipeId.ToString(CultureInfo.InvariantCulture)} / {newMaterialName}";
            auditItems.Add(AuditLogRepository.Create("آنالیز محصولات", "قلم مصرفی محصول", entityId, entityName, "کالا/خدمت", old.MaterialName, newMaterialName, "ویرایش", "Text", "Analyses"));
            auditItems.Add(AuditLogRepository.CreateDecimal("آنالیز محصولات", "قلم مصرفی محصول", entityId, entityName, "مقدار مصرف", old.Quantity, input.Quantity, "ویرایش", "Number", "Analyses"));
        }

        transaction.Commit();
        _auditLogs.AddMany(auditItems);
        return normalizedInputs.Count;
    }

    public IReadOnlyList<MaterialUsageSummary> GetMaterialUsageSummary(string? query = null)
    {
        EnsureInitialized();
        var items = new List<MaterialUsageSummary>();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT m.Id, m.Name, m.Kind, COUNT(pc.Id) AS UsageCount
            FROM Materials m
            LEFT JOIN ProductComponents pc
                ON pc.MaterialId = m.Id OR (pc.MaterialId IS NULL AND lower(pc.MaterialName) = lower(m.Name))
            WHERE $query IS NULL
                OR m.Name LIKE '%' || $query || '%'
                OR m.Kind LIKE '%' || $query || '%'
            GROUP BY m.Id, m.Name, m.Kind
            ORDER BY m.Name
            LIMIT 500
            """;
        command.Parameters.AddWithValue("$query", string.IsNullOrWhiteSpace(query) ? DBNull.Value : query.Trim());
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            items.Add(new MaterialUsageSummary(
                reader.GetInt32(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetInt32(3)));
        }

        return items;
    }

    public IReadOnlyList<MaterialUsageRow> GetMaterialUsages(int? materialId = null, string? query = null)
    {
        EnsureInitialized();
        var rows = new List<MaterialUsageRow>();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT m.Id, m.Name, m.Kind, pr.Id, pr.Code, pr.ProductType, pr.WasteCategoryName, pc.Quantity
            FROM ProductComponents pc
            INNER JOIN ProductRecipes pr ON pr.Id = pc.ProductRecipeId
            LEFT JOIN Materials linked ON linked.Id = pc.MaterialId
            INNER JOIN Materials m ON m.Id = COALESCE(linked.Id, (
                SELECT m2.Id
                FROM Materials m2
                WHERE lower(m2.Name) = lower(pc.MaterialName)
                LIMIT 1
            ))
            WHERE ($materialId IS NULL OR m.Id = $materialId)
                AND ($query IS NULL OR m.Name LIKE '%' || $query || '%' OR pr.Code LIKE '%' || $query || '%')
            ORDER BY m.Name, pr.Code
            LIMIT 2000
            """;
        command.Parameters.AddWithValue("$materialId", materialId is > 0 ? materialId.Value : (object)DBNull.Value);
        command.Parameters.AddWithValue("$query", string.IsNullOrWhiteSpace(query) ? DBNull.Value : query.Trim());
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            rows.Add(new MaterialUsageRow(
                reader.GetInt32(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetInt32(3),
                reader.GetString(4),
                ProductTypeCatalog.FromStorage(reader.GetString(5)),
                reader.GetString(6),
                decimal.Parse(reader.GetString(7), CultureInfo.InvariantCulture)));
        }

        return rows;
    }

    public void DeleteComponent(int id)
    {
        EnsureInitialized();
        var old = GetComponentById(id);
        var recipe = old is null ? null : GetById(old.ProductRecipeId);
        var mappedRowKeys = old is null
            ? new List<string>()
            : GetRuleComponentMappings(old.ProductRecipeId)
                .Where(mapping => mapping.Value == old.Id)
                .Select(mapping => mapping.Key)
                .ToList();

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM ProductComponents WHERE Id = $id";
        command.Parameters.AddWithValue("$id", id);
        var deleted = command.ExecuteNonQuery() > 0;
        if (deleted && old is not null)
        {
            var entityId = $"{old.ProductRecipeId}:{old.Id}";
            var entityName = $"{recipe?.Code ?? old.ProductRecipeId.ToString(CultureInfo.InvariantCulture)} / {old.MaterialName}";
            var auditEntries = new List<AuditLogInput>
            {
                AuditLogRepository.Create("آنالیز محصولات", "قلم مصرفی محصول", entityId, entityName, "کالا/خدمت", old.MaterialName, null, "حذف", "Text", "Analyses"),
                AuditLogRepository.CreateDecimal("آنالیز محصولات", "قلم مصرفی محصول", entityId, entityName, "مقدار مصرف", old.Quantity, null, "حذف", "Number", "Analyses")
            };
            auditEntries.AddRange(mappedRowKeys.Select(rowKey => AuditLogRepository.Create(
                "آنالیز محصولات",
                "ردیف‌های Rule Engine",
                entityId,
                entityName,
                "RowKey",
                rowKey,
                rowKey,
                "حذف",
                "Text",
                "Analyses",
                "حذف کامل نگاشت ردیف خودکار")));
            _auditLogs.AddMany(auditEntries);
        }
    }

    private ProductComponent? GetComponentById(int id)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT pc.Id, pc.ProductRecipeId, pc.MaterialId, COALESCE(m.Name, pc.MaterialName), COALESCE(m.MeasurementUnit, 'کیلوگرم'), pc.Quantity
            FROM ProductComponents pc
            LEFT JOIN Materials m ON m.Id = pc.MaterialId
                OR (pc.MaterialId IS NULL AND lower(m.Name) = lower(pc.MaterialName))
            WHERE pc.Id = $id
            """;
        command.Parameters.AddWithValue("$id", id);

        using var reader = command.ExecuteReader();
        return reader.Read()
            ? new ProductComponent
            {
                Id = reader.GetInt32(0),
                ProductRecipeId = reader.GetInt32(1),
                MaterialId = reader.IsDBNull(2) ? null : reader.GetInt32(2),
                MaterialName = reader.GetString(3),
                MeasurementUnit = reader.GetString(4),
                Quantity = ReadDecimal(reader, 5)
            }
            : null;
    }

    private IReadOnlyList<ProductComponent> GetComponents(int productRecipeId)
    {
        var components = new List<ProductComponent>();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT pc.Id, pc.ProductRecipeId, pc.MaterialId, COALESCE(m.Name, pc.MaterialName), COALESCE(m.MeasurementUnit, 'کیلوگرم'), pc.Quantity
            FROM ProductComponents pc
            LEFT JOIN Materials m ON m.Id = pc.MaterialId
                OR (pc.MaterialId IS NULL AND lower(m.Name) = lower(pc.MaterialName))
            WHERE pc.ProductRecipeId = $productRecipeId
            ORDER BY
                CASE
                    WHEN COALESCE(m.Name, pc.MaterialName) LIKE '%بسته بندی%' THEN 3
                    WHEN COALESCE(m.Kind, '') = 'خدمت' THEN 2
                    WHEN COALESCE(m.Kind, '') <> '' THEN 0
                    ELSE 1
                END,
                CASE
                    WHEN COALESCE(m.Name, pc.MaterialName) LIKE '%نخ%' THEN 0
                    ELSE 1
                END,
                pc.Id
            """;
        command.Parameters.AddWithValue("$productRecipeId", productRecipeId);

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            components.Add(new ProductComponent
            {
                Id = reader.GetInt32(0),
                ProductRecipeId = reader.GetInt32(1),
                MaterialId = reader.IsDBNull(2) ? null : reader.GetInt32(2),
                MaterialName = reader.GetString(3),
                MeasurementUnit = reader.GetString(4),
                Quantity = ReadDecimal(reader, 5)
            });
        }

        return components;
    }

    private void EnsureInitialized()
    {
        if (_initialized)
        {
            return;
        }

        lock (_gate)
        {
            if (_initialized)
            {
                return;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(_databasePath)!);
            _materials.GetAll(take: 1);
            _auditLogs.Get(new AuditLogQuery { Take = 1 });
            using var connection = OpenConnection();
            using var command = connection.CreateCommand();
            command.CommandText = """
                CREATE TABLE IF NOT EXISTS ProductRecipes (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Code TEXT NOT NULL,
                    Name TEXT NOT NULL DEFAULT '',
                    ProductGroupName TEXT NOT NULL DEFAULT '',
                    ImagePath TEXT NOT NULL DEFAULT '',
                    ProfitCategoryName TEXT NOT NULL,
                    WasteCategoryName TEXT NOT NULL,
                    ProductType TEXT NOT NULL DEFAULT 'تولیدی',
                    ProductStatus TEXT NOT NULL DEFAULT 'ReadyForSale',
                    MeasurementUnit TEXT NOT NULL DEFAULT 'متر',
                    LaminationOrigin TEXT NOT NULL DEFAULT 'داخلی',
                    WarpDensity TEXT NOT NULL DEFAULT '0',
                    WeftDensity TEXT NOT NULL DEFAULT '0',
                    WeftCount TEXT NOT NULL DEFAULT '0',
                    DyeType TEXT NOT NULL DEFAULT 'رنگی',
                    LayerType TEXT NOT NULL DEFAULT 'تک لایه',
                    ChainType TEXT NOT NULL DEFAULT 'تک چله',
                    GramPerMeter TEXT NOT NULL DEFAULT '0',
                    FaceGramPerMeter TEXT NOT NULL DEFAULT '0',
                    LiningGramPerMeter TEXT NOT NULL DEFAULT '0',
                    BrushingMode TEXT NOT NULL DEFAULT 'دو مرحله‌ای',
                    FinishingType TEXT NOT NULL DEFAULT '',
                    ContainerMeters TEXT NOT NULL DEFAULT '0',
                    ProductPurchasePrice TEXT NOT NULL DEFAULT '0'
                );

                DROP INDEX IF EXISTS IX_ProductRecipes_Code;
                CREATE INDEX IF NOT EXISTS IX_ProductRecipes_Code_Search ON ProductRecipes (Code);

                CREATE TABLE IF NOT EXISTS ProductComponents (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ProductRecipeId INTEGER NOT NULL,
                    MaterialId INTEGER NULL,
                    MaterialName TEXT NOT NULL,
                    Quantity TEXT NOT NULL,
                    FOREIGN KEY(ProductRecipeId) REFERENCES ProductRecipes(Id) ON DELETE CASCADE
                );
                """;
            command.ExecuteNonQuery();
            EnsureRecipeColumns(connection);
            EnsureComponentColumns(connection);

            if (IsRecipesTableEmpty(connection))
            {
                SeedRecipes(connection);
            }

            _initialized = true;
        }
    }

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection($"Data Source={_databasePath}");
        connection.Open();
        return connection;
    }

    private static bool IsRecipesTableEmpty(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM ProductRecipes";
        return Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture) == 0;
    }

    private static void EnsureRecipeColumns(SqliteConnection connection)
    {
        var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "PRAGMA table_info(ProductRecipes)";
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                columns.Add(reader.GetString(1));
            }
        }

        AddColumnIfMissing(connection, columns, "ProductType", "TEXT NOT NULL DEFAULT 'تولیدی'");
        AddColumnIfMissing(connection, columns, "ProductStatus", "TEXT NOT NULL DEFAULT 'ReadyForSale'");
        AddColumnIfMissing(connection, columns, "MeasurementUnit", "TEXT NOT NULL DEFAULT 'متر'");
        AddColumnIfMissing(connection, columns, "LaminationOrigin", "TEXT NOT NULL DEFAULT 'داخلی'");
        AddColumnIfMissing(connection, columns, "BrushingMode", "TEXT NOT NULL DEFAULT 'دو مرحله‌ای'");
        AddColumnIfMissing(connection, columns, "FinishingType", "TEXT NOT NULL DEFAULT ''");
        AddColumnIfMissing(connection, columns, "Name", "TEXT NOT NULL DEFAULT ''");
        AddColumnIfMissing(connection, columns, "ProductGroupName", "TEXT NOT NULL DEFAULT ''");
        AddColumnIfMissing(connection, columns, "ImagePath", "TEXT NOT NULL DEFAULT ''");
        AddColumnIfMissing(connection, columns, "WarpDensity", "TEXT NOT NULL DEFAULT '0'");
        AddColumnIfMissing(connection, columns, "WeftDensity", "TEXT NOT NULL DEFAULT '0'");
        AddColumnIfMissing(connection, columns, "WeftCount", "TEXT NOT NULL DEFAULT '0'");
        AddColumnIfMissing(connection, columns, "DyeType", "TEXT NOT NULL DEFAULT 'رنگی'");
        AddColumnIfMissing(connection, columns, "LayerType", "TEXT NOT NULL DEFAULT 'تک لایه'");
        AddColumnIfMissing(connection, columns, "ChainType", "TEXT NOT NULL DEFAULT 'تک چله'");
        AddColumnIfMissing(connection, columns, "GramPerMeter", "TEXT NOT NULL DEFAULT '0'");
        AddColumnIfMissing(connection, columns, "FaceGramPerMeter", "TEXT NOT NULL DEFAULT '0'");
        AddColumnIfMissing(connection, columns, "LiningGramPerMeter", "TEXT NOT NULL DEFAULT '0'");
        AddColumnIfMissing(connection, columns, "ContainerMeters", "TEXT NOT NULL DEFAULT '0'");
        AddColumnIfMissing(connection, columns, "ProductPurchasePrice", "TEXT NOT NULL DEFAULT '0'");
    }

    private static void EnsureComponentColumns(SqliteConnection connection)
    {
        var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "PRAGMA table_info(ProductComponents)";
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                columns.Add(reader.GetString(1));
            }
        }

        if (!columns.Contains("MaterialId"))
        {
            using var addColumn = connection.CreateCommand();
            addColumn.CommandText = "ALTER TABLE ProductComponents ADD COLUMN MaterialId INTEGER NULL";
            addColumn.ExecuteNonQuery();
        }

        using var backfill = connection.CreateCommand();
        backfill.CommandText = """
            UPDATE ProductComponents
            SET MaterialId = (
                SELECT Id
                FROM Materials
                WHERE lower(Materials.Name) = lower(ProductComponents.MaterialName)
                LIMIT 1
            )
            WHERE MaterialId IS NULL
            """;
        backfill.ExecuteNonQuery();
    }

    private static void AddColumnIfMissing(SqliteConnection connection, HashSet<string> columns, string name, string definition)
    {
        if (columns.Contains(name))
        {
            return;
        }

        using var command = connection.CreateCommand();
        command.CommandText = $"ALTER TABLE ProductRecipes ADD COLUMN {name} {definition}";
        command.ExecuteNonQuery();
    }

    private MaterialItem? GetMaterialByName(string materialName)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Name, Kind, Price, Unit, RialPrice, LastEditedAt
            FROM Materials
            WHERE lower(Name) = lower($name)
            LIMIT 1
            """;
        command.Parameters.AddWithValue("$name", materialName.Trim());
        using var reader = command.ExecuteReader();
        return reader.Read()
            ? new MaterialItem
            {
                Id = reader.GetInt32(0),
                Name = reader.GetString(1),
                Kind = reader.GetString(2),
                Price = decimal.Parse(reader.GetString(3), CultureInfo.InvariantCulture),
                Unit = reader.GetString(4),
                RialPrice = decimal.Parse(reader.GetString(5), CultureInfo.InvariantCulture),
                LastEditedAt = DateTime.TryParse(reader.GetString(6), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var value) ? value : DateTime.Now
            }
            : null;
    }

    private void SeedRecipes(SqliteConnection connection)
    {
        using var stream = File.OpenRead(_seedPath);
        var seed = JsonSerializer.Deserialize<PricingData>(stream, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? new PricingData();

        using var transaction = connection.BeginTransaction();
        foreach (var recipe in seed.Recipes.Where(item => item.Components.Count > 0))
        {
            using var insertRecipe = connection.CreateCommand();
            insertRecipe.Transaction = transaction;
            insertRecipe.CommandText = """
                INSERT INTO ProductRecipes (Code, Name, ProductGroupName, ImagePath, ProfitCategoryName, WasteCategoryName, ProductType, WarpDensity, WeftDensity, WeftCount, DyeType, LayerType, ChainType, GramPerMeter, FaceGramPerMeter, LiningGramPerMeter)
                VALUES ($code, '', '', '', $profitCategoryName, $wasteCategoryName, 'تولیدی', '0', '0', '0', 'رنگی', 'تک لایه', 'تک چله', '0', '0', '0');
                SELECT last_insert_rowid();
                """;
            insertRecipe.Parameters.AddWithValue("$code", recipe.Code.Trim());
            insertRecipe.Parameters.AddWithValue("$profitCategoryName", recipe.ProfitRate.ToString(CultureInfo.InvariantCulture));
            insertRecipe.Parameters.AddWithValue("$wasteCategoryName", recipe.WasteRate.ToString(CultureInfo.InvariantCulture));
            var recipeId = Convert.ToInt32(insertRecipe.ExecuteScalar(), CultureInfo.InvariantCulture);

            foreach (var component in recipe.Components)
            {
                using var insertComponent = connection.CreateCommand();
                insertComponent.Transaction = transaction;
                insertComponent.CommandText = """
                    INSERT INTO ProductComponents (ProductRecipeId, MaterialId, MaterialName, Quantity)
                    VALUES ($productRecipeId, (SELECT Id FROM Materials WHERE lower(Name) = lower($materialName) LIMIT 1), $materialName, $quantity)
                    """;
                insertComponent.Parameters.AddWithValue("$productRecipeId", recipeId);
                insertComponent.Parameters.AddWithValue("$materialName", component.MaterialName.Trim());
                insertComponent.Parameters.AddWithValue("$quantity", StoreDecimal(component.Quantity));
                insertComponent.ExecuteNonQuery();
            }
        }

        transaction.Commit();
    }

    private static ProductRecipe ReadRecipeHeader(SqliteDataReader reader)
    {
        var profitCategoryName = reader.GetString(5);
        var wasteCategoryName = reader.GetString(6);
        var storedLayerType = reader.GetString(12);
        var gramPerMeter = ReadDecimal(reader, 14);
        var faceGramPerMeter = ReadDecimal(reader, 15);
        var liningGramPerMeter = ReadDecimal(reader, 16);
        var isLegacySemiFinished = string.Equals(storedLayerType, "نیمه آماده", StringComparison.Ordinal);
        var productStatus = isLegacySemiFinished
            ? ProductStatus.SemiFinished
            : ReadProductStatus(reader.GetString(17));
        var layerType = isLegacySemiFinished
            ? InferLegacyLayerType(gramPerMeter, faceGramPerMeter, liningGramPerMeter)
            : storedLayerType;
        return new ProductRecipe
        {
            Id = reader.GetInt32(0),
            Code = reader.GetString(1),
            Name = reader.GetString(2),
            ProductGroupName = reader.GetString(3),
            ImagePath = reader.GetString(4),
            ProfitCategoryName = profitCategoryName,
            WasteCategoryName = wasteCategoryName,
            ProfitRate = decimal.TryParse(profitCategoryName, CultureInfo.InvariantCulture, out var profitRate) ? profitRate : 0,
            WasteRate = decimal.TryParse(wasteCategoryName, CultureInfo.InvariantCulture, out var wasteRate) ? wasteRate : 0,
            ProductType = ProductTypeCatalog.FromStorage(reader.GetString(7)),
            ProductStatus = productStatus,
            WarpDensity = ReadDecimal(reader, 8),
            WeftDensity = ReadDecimal(reader, 9),
            WeftCount = ReadDecimal(reader, 10),
            DyeType = reader.GetString(11),
            LayerType = layerType,
            ChainType = reader.GetString(13),
            GramPerMeter = gramPerMeter,
            FaceGramPerMeter = faceGramPerMeter,
            LiningGramPerMeter = liningGramPerMeter,
            BrushingMode = reader.GetString(18),
            FinishingType = reader.GetString(19),
            ContainerMeters = ReadDecimal(reader, 20),
            MeasurementUnit = MeasurementUnitCatalog.Normalize(reader.GetString(21)),
            LaminationOrigin = LaminationOriginCatalog.Normalize(reader.GetString(22)),
            ProductPurchasePrice = ReadDecimal(reader, 23)
        };
    }

    private static void AddRecipeParameters(SqliteCommand command, ProductRecipeInput input)
    {
        command.Parameters.AddWithValue("$code", input.Code.Trim());
        command.Parameters.AddWithValue("$name", input.Name.Trim());
        command.Parameters.AddWithValue("$productGroupName", (input.ProductGroupName ?? "").Trim());
        command.Parameters.AddWithValue("$imagePath", input.ImagePath.Trim());
        command.Parameters.AddWithValue("$profitCategoryName", input.ProfitCategoryName.Trim());
        command.Parameters.AddWithValue("$wasteCategoryName", input.WasteCategoryName.Trim());
        command.Parameters.AddWithValue("$productType", ProductTypeCatalog.ToStorage(input.ProductType));
        command.Parameters.AddWithValue("$productStatus", StoreProductStatus(input.ProductStatus));
        command.Parameters.AddWithValue("$measurementUnit", MeasurementUnitCatalog.Normalize(input.MeasurementUnit));
        command.Parameters.AddWithValue("$laminationOrigin", LaminationOriginCatalog.Normalize(input.LaminationOrigin));
        command.Parameters.AddWithValue("$warpDensity", StoreDecimal(input.WarpDensity));
        command.Parameters.AddWithValue("$weftDensity", StoreDecimal(input.WeftDensity));
        command.Parameters.AddWithValue("$weftCount", StoreDecimal(input.WeftCount));
        command.Parameters.AddWithValue("$dyeType", input.DyeType.Trim());
        command.Parameters.AddWithValue("$layerType", input.LayerType.Trim());
        command.Parameters.AddWithValue("$chainType", input.ChainType.Trim());
        command.Parameters.AddWithValue("$gramPerMeter", StoreDecimal(input.GramPerMeter));
        command.Parameters.AddWithValue("$faceGramPerMeter", StoreDecimal(input.FaceGramPerMeter));
        command.Parameters.AddWithValue("$liningGramPerMeter", StoreDecimal(input.LiningGramPerMeter));
        command.Parameters.AddWithValue("$brushingMode", input.BrushingMode.Trim());
        command.Parameters.AddWithValue("$finishingType", (input.FinishingType ?? "").Trim());
        command.Parameters.AddWithValue("$containerMeters", StoreDecimal(input.ContainerMeters));
        command.Parameters.AddWithValue("$productPurchasePrice", StoreDecimal(input.ProductPurchasePrice));
    }

    private static decimal ReadDecimal(SqliteDataReader reader, int ordinal)
    {
        return decimal.Parse(reader.GetString(ordinal), CultureInfo.InvariantCulture);
    }

    private static string StoreDecimal(decimal value)
    {
        return value.ToString(CultureInfo.InvariantCulture);
    }

    private static ProductStatus ReadProductStatus(string value)
    {
        return Enum.TryParse<ProductStatus>(value, ignoreCase: false, out var status) &&
            Enum.IsDefined(status)
            ? status
            : ProductStatus.ReadyForSale;
    }

    private static string StoreProductStatus(ProductStatus status)
    {
        if (!Enum.IsDefined(status))
        {
            throw new ArgumentOutOfRangeException(nameof(status), status, "وضعیت محصول معتبر نیست.");
        }

        return status.ToString();
    }

    private static string InferLegacyLayerType(
        decimal gramPerMeter,
        decimal faceGramPerMeter,
        decimal liningGramPerMeter)
    {
        if (faceGramPerMeter > 0 || liningGramPerMeter > 0)
        {
            return "دولایه";
        }

        return "تک لایه";
    }

    private static IReadOnlyList<AuditLogInput> BuildRecipeLogs(ProductRecipe? oldRecipe, ProductRecipe? newRecipe, string operation)
    {
        var entityId = (newRecipe?.Id ?? oldRecipe?.Id ?? 0).ToString(CultureInfo.InvariantCulture);
        var entityName = newRecipe?.Code ?? oldRecipe?.Code ?? "";
        return
        [
            AuditLogRepository.Create("آنالیز محصولات", "محصول", entityId, entityName, "کد محصول", oldRecipe?.Code, newRecipe?.Code, operation, "Text", "Analyses"),
            AuditLogRepository.Create("آنالیز محصولات", "محصول", entityId, entityName, "نام محصول", oldRecipe?.Name, newRecipe?.Name, operation, "Text", "Analyses"),
            AuditLogRepository.Create("آنالیز محصولات", "محصول", entityId, entityName, "گروه محصول", oldRecipe?.ProductGroupName, newRecipe?.ProductGroupName, operation, "Text", "Analyses"),
            AuditLogRepository.Create("آنالیز محصولات", "محصول", entityId, entityName, "تصویر محصول", oldRecipe?.ImagePath, newRecipe?.ImagePath, operation, "Text", "Analyses"),
            AuditLogRepository.Create("آنالیز محصولات", "محصول", entityId, entityName, "چله", oldRecipe?.ChainType, newRecipe?.ChainType, operation, "Text", "Analyses"),
            AuditLogRepository.Create("آنالیز محصولات", "محصول", entityId, entityName, "وضعیت کالا", oldRecipe is null ? null : StoreProductStatus(oldRecipe.ProductStatus), newRecipe is null ? null : StoreProductStatus(newRecipe.ProductStatus), operation, "Text", "Analyses"),
            AuditLogRepository.Create("آنالیز محصولات", "محصول", entityId, entityName, "واحد محصول", oldRecipe?.MeasurementUnit, newRecipe?.MeasurementUnit, operation, "Text", "Analyses"),
            AuditLogRepository.Create("آنالیز محصولات", "محصول", entityId, entityName, "مبدأ لمینت", oldRecipe?.LaminationOrigin, newRecipe?.LaminationOrigin, operation, "Text", "Analyses"),
            AuditLogRepository.Create("آنالیز محصولات", "محصول", entityId, entityName, "دسته سود", oldRecipe?.ProfitCategoryName, newRecipe?.ProfitCategoryName, operation, "Text", "Analyses"),
            AuditLogRepository.Create("آنالیز محصولات", "محصول", entityId, entityName, "دسته کسری و ضایعات", oldRecipe?.WasteCategoryName, newRecipe?.WasteCategoryName, operation, "Text", "Analyses"),
            AuditLogRepository.CreateDecimal("آنالیز محصولات", "محصول", entityId, entityName, "متراژ در کانتینر", oldRecipe?.ContainerMeters, newRecipe?.ContainerMeters, operation, "Number", "Analyses")
        ];
    }
}
