import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { Response } from 'express';

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private logger = new Logger('API');

  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let message: string | string[] = 'An unexpected error occurred';

    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      message = typeof body === 'string' ? body : (body as { message: string | string[] }).message;
    } else if (error instanceof Error && 'type' in error && error.type === 'entity.parse.failed') {
      status = 400;
      message = 'Malformed JSON request';
    } else if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
      status = 413;
      message = 'Request body is too large';
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (['P1000', 'P1001', 'P1002', 'P1003', 'P1017'].includes(error.code)) {
        status = 503;
        message =
          process.env.NODE_ENV === 'production'
            ? 'Database service unavailable'
            : 'PostgreSQL is unavailable or its credentials are invalid. Check DATABASE_URL and run npm run doctor.';
      }
      if (error.code === 'P2002') {
        status = 409;
        message = 'This record already exists';
      }
      if (error.code === 'P2025') {
        status = 404;
        message = 'Record not found';
      }
      if (error.code === 'P2003' || error.code === 'P2034') {
        status = 409;
        message = 'Records changed. Refresh and retry.';
      }
    }

    if (status === 500) this.logger.error(error instanceof Error ? error.name : 'UnknownError');
    response.status(status).json({ statusCode: status, message });
  }
}
