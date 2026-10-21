import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { Permission, RbacGuard, RequirePermissions } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthRequest } from '../../common/utils/security';
import { VacancyFieldsService } from './vacancy-fields.service';
import { vacancyFieldSchema, type VacancyFieldDto } from './dto/vacancy-field.dto';

@Controller('vacancy-fields')
@UseGuards(AuthGuard, RbacGuard)
export class VacancyFieldsController {
  constructor(@Inject(VacancyFieldsService) private service: VacancyFieldsService) {}

  @Get()
  list(@Req() req: AuthRequest) {
    return this.service.list(req.user.companyId);
  }

  @Post()
  @RequirePermissions(Permission.MANAGE_VACANCIES)
  create(@Req() req: AuthRequest, @Body(new ZodValidationPipe(vacancyFieldSchema)) dto: VacancyFieldDto) {
    return this.service.create(req.user, dto);
  }

  @Put(':id')
  @RequirePermissions(Permission.MANAGE_VACANCIES)
  update(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(vacancyFieldSchema)) dto: VacancyFieldDto,
  ) {
    return this.service.update(req.user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.MANAGE_VACANCIES)
  remove(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(req.user, id);
  }
}
