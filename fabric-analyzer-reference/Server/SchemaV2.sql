SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;

IF COL_LENGTH('dbo.Settings', 'MaxWeftCycleSlots') IS NULL
    ALTER TABLE dbo.Settings ADD MaxWeftCycleSlots int NOT NULL
        CONSTRAINT DF_Settings_MaxWeftCycleSlots DEFAULT (8)
        CONSTRAINT CK_Settings_MaxWeftCycleSlots CHECK (MaxWeftCycleSlots BETWEEN 1 AND 12);

IF COL_LENGTH('dbo.YarnWeighings', 'Beam') IS NULL
    ALTER TABLE dbo.YarnWeighings ADD Beam int NULL;

IF OBJECT_ID('dbo.CK_Weigh_Beam', 'C') IS NULL
    EXEC(N'ALTER TABLE dbo.YarnWeighings ADD CONSTRAINT CK_Weigh_Beam CHECK (Beam IS NULL OR ([Axis] = 0 AND Beam BETWEEN 0 AND 2));');

IF COL_LENGTH('dbo.Yarns', 'CatalogCode') IS NULL
    ALTER TABLE dbo.Yarns ADD CatalogCode nvarchar(80) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Yarns') AND name = 'IX_Yarns_CatalogCode')
    EXEC(N'CREATE UNIQUE INDEX IX_Yarns_CatalogCode ON dbo.Yarns(CatalogCode) WHERE CatalogCode IS NOT NULL');

IF OBJECT_ID('dbo.SettingRevisions', 'U') IS NULL
    CREATE TABLE dbo.SettingRevisions (
        Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Tolerance decimal(24,10) NOT NULL CHECK (Tolerance BETWEEN 0 AND 100),
        MaxWeftCycleSlots int NOT NULL CHECK (MaxWeftCycleSlots BETWEEN 1 AND 12),
        [User] nvarchar(max) NOT NULL,
        [At] datetimeoffset NOT NULL,
        Reason nvarchar(max) NOT NULL
    );

IF NOT EXISTS (SELECT 1 FROM dbo.SettingRevisions)
    EXEC(N'INSERT INTO dbo.SettingRevisions(Tolerance, MaxWeftCycleSlots, [User], [At], Reason)
        SELECT Tolerance, MaxWeftCycleSlots, N''schema-v2'', SYSUTCDATETIME(), N''Baseline'' FROM dbo.Settings WHERE Id = 1;');
