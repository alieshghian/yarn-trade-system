using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;

namespace YarnTrade.Api.Controllers;

public sealed record YarnDefinitionRow {
    public Guid Id {get;init;}
    public Guid YarnId {get;init;}
    public DateTime LastChangedAtUtc {get;init;}
    public byte[] RowVersion {get;init;}=[];
    public Guid? ColorId {get;init;}
    public string Code {get;init;}="";
    public string ComprehensiveName {get;init;}="";
    public string Color {get;init;}="";
    public string Material {get;init;}="";
    public string Luster {get;init;}="";
    public decimal? CountValue {get;init;}
    public string CountType {get;init;}="";
    public string Status {get;init;}="";
    public string YarnGroup {get;init;}="";
    public decimal? FilamentNumber {get;init;}
    public string ContinuityType {get;init;}="";
}
public sealed partial class YarnsController
{
    // One real row per persisted color; legacy masters without colors remain visible.
    [HttpPost("definition-grid"),RequirePermission("yarns.view")]
    public Task<ActionResult<ServerGridPage<YarnDefinitionRow>>> DefinitionGrid(WarehouseGridRequest input,CancellationToken ct) {
        var query=from y in db.YarnItems.AsNoTracking()
            join color in db.Set<YarnColor>() on y.Id equals color.YarnId into colors
            from c in colors.DefaultIfEmpty()
            join grp in db.ProductGroups on y.ProductGroupId equals (Guid?)grp.Id into groups
            from g in groups.DefaultIfEmpty()
            select new YarnDefinitionRow{Id=c==null?y.Id:c.Id,YarnId=y.Id,LastChangedAtUtc=y.UpdatedAtUtc??y.CreatedAtUtc,RowVersion=y.RowVersion,ColorId=c==null?null:c.Id,
                Code=y.Code,ComprehensiveName=y.ComprehensiveName,Color=c==null?"":c.Value,
                Material=y.Material??"",Luster=y.Luster??"",CountValue=y.CountValue,
                CountType=y.CountType??"",Status=y.IsActive?"فعال":"غیرفعال",YarnGroup=g==null?"":g.Name,
                FilamentNumber=y.FilamentNumber,ContinuityType=y.ContinuityType??""};
        string[] columns=["Code","ComprehensiveName","Color","Material","Luster","CountValue","CountType","Status","YarnGroup","FilamentNumber","ContinuityType"];
        var sources=new Dictionary<string,string>{["code"]="Code",["comprehensiveName"]="ComprehensiveName",["material"]="Material",["luster"]="Luster",["countValue"]="CountValue",["countType"]="CountType",["isActive"]="Status",["yarnGroup"]="YarnGroup",["filamentNumber"]="FilamentNumber",["continuityType"]="ContinuityType",["field.74b142df-2a91-4036-afa8-8a52a8a6e4f4"]="Color"};
        var aliases=ApprovedDefinition.RootElement.GetProperty("schema").GetProperty("tables")[0].GetProperty("columns").EnumerateArray().ToDictionary(c=>c.GetProperty("id").GetString()!,c=>sources.GetValueOrDefault(c.GetProperty("sourceFieldIds")[0].GetString()!)??"ComprehensiveName");
        string Resolve(string id)=>aliases.GetValueOrDefault(id)??id;
        var request=input with {Filters=input.Filters?.ToDictionary(k=>Resolve(k.Key),v=>v.Value),Sort=input.Sort?.Select(s=>s with {Id=Resolve(s.Id)}).ToList(),OptionsColumn=input.OptionsColumn is null?null:Resolve(input.OptionsColumn)};
        return ServerReportQuery.Run(query,request,ct,columns,nameof(YarnDefinitionRow.LastChangedAtUtc));
    }
}
