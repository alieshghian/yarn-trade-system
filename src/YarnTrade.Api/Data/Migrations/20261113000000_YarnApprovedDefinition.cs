using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261113000000_YarnApprovedDefinition")]
public sealed class YarnApprovedDefinition : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        // Additive only: no demo imports, resets, or changes to existing identities.
        foreach (var column in new[]{"Luster","UnitOfMeasure","FixStatus","Material","SpinType","SpinningMethod","ContinuityType","CountType","TwistType"})
            m.Sql($"ALTER TABLE [YarnItems] ALTER COLUMN [{column}] nvarchar(120) {(column=="UnitOfMeasure"?"NOT NULL":"NULL")};");
        m.Sql("""
            CREATE TABLE [YarnDefinitionStates] (
              [YarnId] uniqueidentifier NOT NULL PRIMARY KEY,
              [ReleaseId] nvarchar(36) NOT NULL, [ValuesJson] nvarchar(max) NOT NULL,
              [NormalizedName] nvarchar(240) COLLATE Latin1_General_100_BIN2 NOT NULL,
              CONSTRAINT [FK_YarnDefinitionStates_YarnItems] FOREIGN KEY ([YarnId]) REFERENCES [YarnItems]([Id]));
            CREATE UNIQUE INDEX [IX_YarnDefinitionStates_NormalizedName] ON [YarnDefinitionStates]([NormalizedName]);
            CREATE TABLE [YarnDefinitionReferences] (
              [Id] uniqueidentifier NOT NULL PRIMARY KEY, [CreatedAtUtc] datetime2 NOT NULL,
              [UpdatedAtUtc] datetime2 NULL, [RowVersion] rowversion NOT NULL,
              [FieldId] nvarchar(100) NOT NULL, [Name] nvarchar(120) NOT NULL,
              [NormalizedName] nvarchar(240) COLLATE Latin1_General_100_BIN2 NOT NULL, [IsDefault] bit NOT NULL);
            CREATE UNIQUE INDEX [IX_YarnDefinitionReferences_FieldId_NormalizedName] ON [YarnDefinitionReferences]([FieldId],[NormalizedName]);
            CREATE TABLE [YarnColors] (
              [Id] uniqueidentifier NOT NULL PRIMARY KEY, [YarnId] uniqueidentifier NOT NULL,
              [Value] nvarchar(120) NOT NULL, [NormalizedValue] nvarchar(240) COLLATE Latin1_General_100_BIN2 NOT NULL,
              [IsDefault] bit NOT NULL,
              CONSTRAINT [FK_YarnColors_YarnItems] FOREIGN KEY ([YarnId]) REFERENCES [YarnItems]([Id]));
            CREATE UNIQUE INDEX [IX_YarnColors_YarnId_NormalizedValue] ON [YarnColors]([YarnId],[NormalizedValue]);
            CREATE UNIQUE INDEX [IX_YarnColors_YarnId] ON [YarnColors]([YarnId]) WHERE [IsDefault]=1;
            CREATE TABLE [YarnPackagingCoefficients] (
              [Id] uniqueidentifier NOT NULL PRIMARY KEY, [YarnId] uniqueidentifier NOT NULL,
              [PackagingId] uniqueidentifier NOT NULL, [CbmPerTon] decimal(20,6) NOT NULL, [IsDefault] bit NOT NULL,
              CONSTRAINT [CK_YarnPackagingCoefficients_Positive] CHECK ([CbmPerTon]>0),
              CONSTRAINT [FK_YarnPackagingCoefficients_YarnItems] FOREIGN KEY ([YarnId]) REFERENCES [YarnItems]([Id]),
              CONSTRAINT [FK_YarnPackagingCoefficients_Reference] FOREIGN KEY ([PackagingId]) REFERENCES [YarnDefinitionReferences]([Id]));
            CREATE UNIQUE INDEX [IX_YarnPackagingCoefficients_YarnId_PackagingId] ON [YarnPackagingCoefficients]([YarnId],[PackagingId]);
            CREATE UNIQUE INDEX [IX_YarnPackagingCoefficients_YarnId] ON [YarnPackagingCoefficients]([YarnId]) WHERE [IsDefault]=1;
            CREATE INDEX [IX_YarnPackagingCoefficients_PackagingId] ON [YarnPackagingCoefficients]([PackagingId]);
            """);
    }
    protected override void Down(MigrationBuilder m) => throw new NotSupportedException("Approved yarn identities and references must be preserved.");
}
