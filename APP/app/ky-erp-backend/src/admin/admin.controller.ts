import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from "@nestjs/common";
import { AdminService } from "./admin.service";

@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("firma-esleme")
  getFirmaEsleme() {
    return this.adminService.getFirmaEsleme();
  }

  @Get("firma-eslemeleri")
  getFirmaEslemeleri(
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
  ) {
    return this.adminService.getCompanyAliases({
      mainCompanyId,
      mainCompanySlug,
    });
  }

  @Get("company-aliases")
  getCompanyAliases(
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("includeDeleted") includeDeleted?: string,
  ) {
    return this.adminService.getCompanyAliases({
      mainCompanyId,
      mainCompanySlug,
      includeDeleted: includeDeleted === "true",
    });
  }

  @Post("company-aliases")
  saveCompanyAlias(@Body() body: any) {
    return this.adminService.saveCompanyAlias(body);
  }

  @Patch("company-aliases/:id")
  updateCompanyAlias(@Param("id") id: string, @Body() body: any) {
    return this.adminService.updateCompanyAlias(id, body);
  }

  @Post("company-aliases/:id/activate")
  activateCompanyAlias(@Param("id") id: string, @Body() body: any) {
    return this.adminService.activateCompanyAlias(body, id);
  }

  @Post("company-aliases/:id/deactivate")
  deactivateCompanyAlias(@Param("id") id: string, @Body() body: any) {
    return this.adminService.deactivateCompanyAlias(body, id);
  }

  @Post("company-aliases/:id/delete")
  deleteCompanyAlias(@Param("id") id: string, @Body() body: any) {
    return this.adminService.deleteCompanyAlias(body, id);
  }

  @Post("company-aliases/:id/restore")
  restoreCompanyAlias(@Param("id") id: string, @Body() body: any) {
    return this.adminService.restoreCompanyAlias(body, id);
  }

  @Get("product-aliases")
  getProductAliases(
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("includeDeleted") includeDeleted?: string,
  ) {
    return this.adminService.getProductAliases({
      mainCompanyId,
      mainCompanySlug,
      includeDeleted: includeDeleted === "true",
    });
  }

  @Post("product-aliases")
  saveProductAlias(@Body() body: any) {
    return this.adminService.saveProductAlias(body);
  }

  @Patch("product-aliases/:id")
  updateProductAlias(@Param("id") id: string, @Body() body: any) {
    return this.adminService.updateProductAlias(id, body);
  }

  @Post("product-aliases/:id/activate")
  activateProductAlias(@Param("id") id: string, @Body() body: any) {
    return this.adminService.activateProductAlias(body, id);
  }

  @Post("product-aliases/:id/deactivate")
  deactivateProductAlias(@Param("id") id: string, @Body() body: any) {
    return this.adminService.deactivateProductAlias(body, id);
  }

  @Post("product-aliases/:id/delete")
  deleteProductAlias(@Param("id") id: string, @Body() body: any) {
    return this.adminService.deleteProductAlias(body, id);
  }

  @Post("product-aliases/:id/restore")
  restoreProductAlias(@Param("id") id: string, @Body() body: any) {
    return this.adminService.restoreProductAlias(body, id);
  }

  @Get("mail-kisileri")
  getMailKisileri(
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
  ) {
    return this.adminService.getMailKisileri({
      mainCompanyId,
      mainCompanySlug,
    });
  }

  @Get("firma-kartlari")
  getFirmaKartlari(
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
  ) {
    return this.adminService.getFirmaKartlari({ mainCompanyId, mainCompanySlug });
  }

  @Post("firma-kartlari")
  saveFirmaKarti(@Body() body: any) {
    return this.adminService.saveFirmaKarti(body);
  }

  @Patch("firma-kartlari/:id")
  updateFirmaKarti(@Param("id") id: string, @Body() body: any) {
    return this.adminService.saveFirmaKarti({ ...body, id });
  }

  @Get("firma-kartlari/:id/contacts")
  getFirmaContacts(
    @Param("id") id: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
  ) {
    return this.adminService.getFirmaContacts(id, { mainCompanyId, mainCompanySlug });
  }

  @Post("firma-kartlari/:id/contacts")
  saveFirmaContact(@Param("id") id: string, @Body() body: any) {
    return this.adminService.saveFirmaContact({ ...body, firmId: id });
  }

  @Patch("company-contacts/:id")
  updateFirmaContact(@Param("id") id: string, @Body() body: any) {
    return this.adminService.saveFirmaContact({ ...body, id });
  }

  @Get("eposta-kisileri")
  getEpostaKisileri(
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
  ) {
    return this.adminService.getMailKisileri({
      mainCompanyId,
      mainCompanySlug,
    });
  }

  @Get("kdv-baglantisi")
  getKdvBaglantisi() {
    return this.adminService.getKdvBaglantisi();
  }

  @Get("kdv-baglantilari")
  getKdvBaglantilari() {
    return this.adminService.getKdvBaglantisi();
  }

  @Get("yedekleme")
  getYedekleme() {
    return this.adminService.getYedekleme();
  }

  @Get("yedekleme-durumu")
  getYedeklemeDurumu() {
    return this.adminService.getYedekleme();
  }

  @Get("loglar")
  getLoglar() {
    return this.adminService.getLoglar();
  }

  @Get("security")
  getSecuritySummary() {
    return this.adminService.getSecuritySummary();
  }

  @Get("main-companies")
  getMainCompanies() {
    return this.adminService.getMainCompanies();
  }

  @Post("main-companies")
  createMainCompany(@Body() body: any) {
    return this.adminService.createMainCompany(body);
  }

  @Patch("main-companies")
  updateMainCompanyByBody(@Body() body: any) {
    return this.adminService.updateMainCompany(String(body?.id || ""), body);
  }

  @Patch("main-companies/:id")
  updateMainCompany(@Param("id") id: string, @Body() body: any) {
    return this.adminService.updateMainCompany(id, body);
  }

  @Post("main-companies/:id/delete")
  deleteMainCompany(@Param("id") id: string, @Body() body: any) {
    return this.adminService.deleteMainCompany(id, body?.adminPassword);
  }

  @Post("main-companies/:id/transfer")
  transferMainCompany(@Param("id") id: string, @Body() body: any) {
    return this.adminService.transferMainCompanyData(
      id,
      body?.targetId,
      body?.adminPassword,
    );
  }
}
