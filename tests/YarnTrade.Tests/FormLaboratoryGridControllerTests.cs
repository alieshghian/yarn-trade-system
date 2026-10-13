using Microsoft.AspNetCore.Mvc;
using YarnTrade.Api.Controllers;

namespace YarnTrade.Tests;

public sealed class FormLaboratoryGridControllerTests
{
    [Fact]
    public void SearchMatchesAllTermsAcrossColumnsAndFullDataset()
    {
        var controller = new FormLaboratoryGridController();
        var response = controller.Query(new SyntheticGridRequest(
            DatasetSize: 100_000,
            Page: 1,
            PageSize: 100,
            Search: "نخ 09121000002"));

        var page = Assert.IsType<ServerGridPage<SyntheticGridPerson>>(
            Assert.IsType<OkObjectResult>(response.Result).Value);

        Assert.Equal(1, page.Total);
        Assert.Equal("synthetic-person-3", Assert.Single(page.Items).Id);
    }

    [Fact]
    public void SearchTreatsPersianJoinerAsAWordBoundary()
    {
        var controller = new FormLaboratoryGridController();
        var response = controller.Query(new SyntheticGridRequest(
            DatasetSize: 100_000,
            Page: 1,
            PageSize: 100,
            Search: "شرکت‌نخ"));

        var page = Assert.IsType<ServerGridPage<SyntheticGridPerson>>(
            Assert.IsType<OkObjectResult>(response.Result).Value);

        Assert.Equal(16_667, page.Total);
        Assert.All(page.Items, row => Assert.Equal("شرکت نخ آریا", row.DisplayName));
    }

    [Fact]
    public void DefaultSearchMatchesTheBeginningOfWordsAndNumbersNotTheirMiddle()
    {
        var controller = new FormLaboratoryGridController();
        var numberResponse = controller.Query(new SyntheticGridRequest(DatasetSize: 100, Search: "21"), CancellationToken.None);
        var numberPage = Assert.IsType<ServerGridPage<SyntheticGridPerson>>(Assert.IsType<OkObjectResult>(numberResponse.Result).Value);
        Assert.Equal("synthetic-person-21", Assert.Single(numberPage.Items).Id);

        var persianDigitResponse = controller.Query(new SyntheticGridRequest(DatasetSize: 100, Search: "۲۱"), CancellationToken.None);
        var persianDigitPage = Assert.IsType<ServerGridPage<SyntheticGridPerson>>(Assert.IsType<OkObjectResult>(persianDigitResponse.Result).Value);
        Assert.Equal(numberPage.Total, persianDigitPage.Total);

        var textResponse = controller.Query(new SyntheticGridRequest(DatasetSize: 100, Search: "ینی"), CancellationToken.None);
        var textPage = Assert.IsType<ServerGridPage<SyntheticGridPerson>>(Assert.IsType<OkObjectResult>(textResponse.Result).Value);
        Assert.Equal(0, textPage.Total);

        var multiTermResponse = controller.Query(new SyntheticGridRequest(DatasetSize: 100, Search: "مشتری چینی 21"), CancellationToken.None);
        var multiTermPage = Assert.IsType<ServerGridPage<SyntheticGridPerson>>(Assert.IsType<OkObjectResult>(multiTermResponse.Result).Value);
        Assert.Equal("synthetic-person-21", Assert.Single(multiTermPage.Items).Id);
    }

    [Fact]
    public void ContainsModeAndReverseModeApplyAcrossTheFullDataset()
    {
        var controller = new FormLaboratoryGridController();
        var containsResponse = controller.Query(new SyntheticGridRequest(DatasetSize: 100, Search: "21", SearchMode: "contains"), CancellationToken.None);
        var containsPage = Assert.IsType<ServerGridPage<SyntheticGridPerson>>(Assert.IsType<OkObjectResult>(containsResponse.Result).Value);
        Assert.Equal(100, containsPage.Total);

        var reverseResponse = controller.Query(new SyntheticGridRequest(DatasetSize: 100, Search: "21", ReverseSearch: true), CancellationToken.None);
        var reversePage = Assert.IsType<ServerGridPage<SyntheticGridPerson>>(Assert.IsType<OkObjectResult>(reverseResponse.Result).Value);
        Assert.Equal(99, reversePage.Total);
        Assert.DoesNotContain(reversePage.Items, row => row.Id == "synthetic-person-21");

        var startsWithResponse = controller.Query(new SyntheticGridRequest(DatasetSize: 100, Search: "21", SearchMode: "startsWith"), CancellationToken.None);
        var startsWithPage = Assert.IsType<ServerGridPage<SyntheticGridPerson>>(Assert.IsType<OkObjectResult>(startsWithResponse.Result).Value);
        Assert.Equal("synthetic-person-21", Assert.Single(startsWithPage.Items).Id);
    }

    [Fact]
    public void ExactModeMatchesTheWholeCellValue()
    {
        var controller = new FormLaboratoryGridController();
        var response = controller.Query(new SyntheticGridRequest(DatasetSize: 100, Search: "چینی", SearchMode: "exact"), CancellationToken.None);
        var page = Assert.IsType<ServerGridPage<SyntheticGridPerson>>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.Equal(20, page.Total);
        Assert.All(page.Items, row => Assert.Equal("چینی", row.Nationality));
    }

    [Fact]
    public async Task ConcurrentSearchesShareThePreparedFullDataset()
    {
        var controller = new FormLaboratoryGridController();
        var requests = Enumerable.Range(0, 8).Select(_ => Task.Run(() => controller.Query(
            new SyntheticGridRequest(DatasetSize: 100_000, Search: "21"), CancellationToken.None)));
        var responses = await Task.WhenAll(requests);
        var pages = responses.Select(response => Assert.IsType<ServerGridPage<SyntheticGridPerson>>(
            Assert.IsType<OkObjectResult>(response.Result).Value)).ToArray();
        Assert.All(pages, page => Assert.Equal(1_111, page.Total));
        Assert.All(pages, page => Assert.Contains(page.Items, row => row.Id == "synthetic-person-21"));
    }
}
