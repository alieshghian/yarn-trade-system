using System.Linq.Expressions;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Security;

namespace YarnTrade.Api.Controllers;

public sealed record WarehouseGridRequest(int Page = 1, int PageSize = 100, string Search = "", string? SearchMode = "startsWith", bool ReverseSearch = false,
    Dictionary<string, GridColumnFilterRequest>? Filters = null, List<GridSortRequest>? Sort = null, string? OptionsColumn = null, string? OptionsSearch = null);
public sealed record WarehouseReportView {
 public Guid Id {get;init;}
 public DateTime LastChangedAtUtc {get;init;}
 public string Code {get;init;}="";
 public string Name {get;init;}="";
 public string Custodian {get;init;}="";
 public string Address {get;init;}="";
 public string Description {get;init;}="";
 public string Floor {get;init;}="";
 public string Status {get;init;}="";
 public int FloorNumber {get;init;}
 public bool IsActive {get;init;}
 public bool IsDefaultReceiving {get;init;}
 public byte[] RowVersion {get;init;}=[];
}
[ApiController, Route("api/warehouses/grid"), Authorize]
public sealed class WarehouseGridController(AppDbContext db) : ControllerBase
{
    private IQueryable<WarehouseReportView> ReportQuery() {
        return from w in db.Warehouses.AsNoTracking()
               join person in db.Persons on w.CustodianPersonId equals (Guid?)person.Id into people
               from p in people.DefaultIfEmpty()
               where w.IsActive
               select new WarehouseReportView {Id=w.Id,LastChangedAtUtc=w.UpdatedAtUtc??w.CreatedAtUtc,RowVersion=w.RowVersion,Code=w.Code,Name=w.NameFa,Custodian=p==null?"":p.DisplayName,Address=w.Address??"",Description=w.Description??""};
    }

    [HttpPost, RequirePermission("warehouses.view")]
    public Task<ActionResult<ServerGridPage<WarehouseReportView>>> Query(WarehouseGridRequest request, CancellationToken ct)=>RunQuery(ReportQuery(),request,ct);

    [HttpPost("~/api/warehouses/{id:guid}/zones/grid"), RequirePermission("warehouses.view")]
    public Task<ActionResult<ServerGridPage<WarehouseReportView>>> Zones(Guid id,WarehouseGridRequest request,int floor,CancellationToken ct)=>RunQuery(
        (from x in db.Set<YarnTrade.Api.Domain.WarehouseZone>().AsNoTracking() join w in db.Warehouses on x.WarehouseId equals w.Id where x.WarehouseId==id&&x.FloorNumber==floor select new WarehouseReportView{Id=x.Id,LastChangedAtUtc=x.UpdatedAtUtc??x.CreatedAtUtc,Code=x.Code,Name=x.Name,Floor=w.FloorCount==1?"همکف":x.FloorNumber==1?"۱ ـ همکف":x.FloorNumber.ToString()+" ـ طبقه "+(x.FloorNumber-1).ToString(),FloorNumber=x.FloorNumber,Description=x.Description??"",Status=x.IsActive?"فعال":"غیرفعال",IsActive=x.IsActive,IsDefaultReceiving=x.IsDefaultReceiving,RowVersion=x.RowVersion}),request,ct,["Code","Name","Floor","Status","Description"]);

    private Task<ActionResult<ServerGridPage<WarehouseReportView>>> RunQuery(IQueryable<WarehouseReportView> query,WarehouseGridRequest request,CancellationToken ct,string[]? allowedColumns=null) => ServerReportQuery.Run(query,request,ct,allowedColumns??["Code","Name","Custodian","Address","Description"],nameof(WarehouseReportView.LastChangedAtUtc));
}
