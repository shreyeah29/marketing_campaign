import {
  BadRequestException,
  Controller,
  Inject,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { MultipartFile } from '@fastify/multipart'
import type { FastifyRequest } from 'fastify'
import sharp, { type Metadata } from 'sharp'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { StorageService } from '../../infrastructure/storage.js'

import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_DIMENSION, MAX_UPLOAD_BYTES } from './uploads.constants.js'

/**
 * The one door files come in through.
 *
 * Uploads go via the API rather than straight from the browser to Supabase, for
 * two reasons that both matter more than the extra hop:
 *
 *   1. The storage service key would otherwise have to reach the browser. It
 *      bypasses row-level security; it belongs on a server.
 *   2. Nothing untrusted should be stored unexamined. Every image is decoded,
 *      dimension-checked and **re-encoded** here, which strips EXIF, discards
 *      any appended payload, and guarantees the bytes in the bucket are an image
 *      because we produced them.
 *
 * The content type is read from the decoded pixels, never from the filename or
 * the client's declared type — both are attacker-controlled and neither is
 * evidence of anything.
 */
@ApiTags('Uploads')
@Controller('uploads')
export class UploadsController {
  constructor(@Inject(StorageService) private readonly storage: StorageService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Upload an image and receive its durable URL' })
  async upload(
    @Req() req: FastifyRequest,
    @CurrentPrincipal() p: Principal,
  ): Promise<{ url: string; width: number; height: number; bytes: number }> {
    if (!this.storage.configured()) {
      // Storing to an expiring provider URL is meaningless for an upload —
      // there is no provider. Say so rather than accepting bytes we will lose.
      throw new ServiceUnavailableException(
        'File storage is not configured on this deployment yet.',
      )
    }

    // `@fastify/multipart` augments FastifyRequest ambiently, which does not
    // reliably reach this file under NodeNext resolution. Naming the shape we
    // rely on is both more honest and more stable than depending on that.
    const multipartReq = req as FastifyRequest & {
      file: () => Promise<MultipartFile | undefined>
    }
    const file = await multipartReq.file().catch(() => null)
    if (!file) throw new BadRequestException('Send one file as multipart/form-data')

    const raw = await file.toBuffer().catch(() => null)
    if (!raw || raw.byteLength === 0) throw new BadRequestException('The file was empty')
    // `file.truncated` is how @fastify/multipart reports hitting the limit; the
    // buffer is silently short otherwise, and a half-image is worse than an error.
    if (file.file.truncated) {
      throw new BadRequestException(
        `Images must be under ${String(Math.round(MAX_UPLOAD_BYTES / 1024 / 1024))}MB`,
      )
    }

    let meta: Metadata
    try {
      meta = await sharp(raw).metadata()
    } catch {
      throw new BadRequestException('That file is not an image we can read')
    }

    const format = meta.format ? `image/${meta.format === 'jpeg' ? 'jpeg' : meta.format}` : ''
    const extension = ACCEPTED_IMAGE_TYPES[format]
    if (!extension) {
      throw new BadRequestException(
        `Upload a PNG, JPEG, WebP or AVIF image. SVG is not accepted for security reasons.`,
      )
    }

    const width = meta.width ?? 0
    const height = meta.height ?? 0
    if (width < 64 || height < 64) {
      throw new BadRequestException('That image is too small to use on a creative')
    }

    // Re-encode. Transparency is preserved as PNG because a product cutout
    // flattened onto white is no longer a cutout; everything else becomes JPEG,
    // which is a fraction of the size for a photograph.
    const transparent = meta.hasAlpha === true
    const pipeline = sharp(raw)
      .rotate() // apply EXIF orientation, then drop the metadata with it
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
    const output = transparent
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
      : await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true })

    const key = `${p.organizationId}/uploads/${Date.now().toString(36)}-${Math.round(
      Math.random() * 1e9,
    ).toString(36)}`

    const stored = await this.storage.persistBytes(
      new Uint8Array(output.data),
      transparent ? 'image/png' : 'image/jpeg',
      key,
    )
    if (!stored.persisted) {
      throw new ServiceUnavailableException('Could not store the file — try again')
    }

    return {
      url: stored.url,
      width: output.info.width,
      height: output.info.height,
      bytes: output.data.byteLength,
    }
  }
}
