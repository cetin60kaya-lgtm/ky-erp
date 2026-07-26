import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsnetSourceIntakeService } from './isnet-source-intake.service';

@Controller('isnet/source-intakes')
export class IsnetSourceIntakeController {
  constructor(private readonly service: IsnetSourceIntakeService) {}

  @Get()
  list(@Query() query: Record<string, string | undefined>) {
    return this.service.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Post('portal')
  createPortal(@Body() body: any) {
    return this.service.create({
      ...body,
      sourceType: 'PORTAL',
      quantity: Number(body.quantity),
    });
  }

  @Post('no-dispatch')
  createNoDispatch(@Body() body: any) {
    return this.service.create({
      ...body,
      sourceType: 'NO_CUSTOMER_DISPATCH',
      customerDispatchNo: null,
      quantity: Number(body.quantity),
    });
  }

  @Post('manual-pdf')
  @UseInterceptors(
    FileInterceptor('pdf', {
      limits: { fileSize: 25 * 1024 * 1024, files: 1 },
      fileFilter: (_request, file, callback) => {
        const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
        callback(isPdf ? null : new Error('Yalnız PDF dosyası yüklenebilir.'), isPdf);
      },
    }),
  )
  createManualPdf(@Body() body: any, @UploadedFile() pdf: Express.Multer.File) {
    return this.service.create(
      {
        ...body,
        sourceType: 'MANUAL_PDF',
        quantity: Number(body.quantity),
      },
      pdf,
    );
  }

  @Patch(':id/model')
  assignModel(@Param('id') id: string, @Body() body: any) {
    return this.service.assignModel(id, body);
  }

  @Patch(':id/customer-dispatch')
  linkCustomerDispatch(@Param('id') id: string, @Body() body: any) {
    return this.service.linkCustomerDispatch(id, body);
  }

  @Post(':id/outgoing-dispatch')
  prepareOutgoingDispatch(@Param('id') id: string, @Body() body: any) {
    return this.service.prepareOutgoingDispatch(id, {
      quantity: Number(body.quantity),
      note: body.note,
    });
  }
}
