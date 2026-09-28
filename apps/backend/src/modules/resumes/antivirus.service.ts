import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as net from 'node:net';

export interface ScanResult {
  isClean: boolean;
  threatName?: string;
  mimeType?: string;
  detectedSignature?: string;
}

// EICAR standard antivirus test signature (RFC compliant test string)
const EICAR_STRING =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

@Injectable()
export class AntivirusService {
  private readonly logger = new Logger(AntivirusService.name);

  /**
   * Verifies file magic numbers (signatures) to ensure the file format matches
   * genuine non-executable document formats and rejects spoofed extensions.
   */
  verifyFileSignature(buffer: Buffer, originalname: string): { valid: boolean; mime: string } {
    if (!buffer || buffer.length < 4) {
      throw new BadRequestException('Fayl bo‘sh yoki yaroqsiz');
    }

    // 1. Explicitly check and block executable binaries
    // Windows PE / DOS executable: "MZ"
    if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
      throw new BadRequestException(
        'Xavfsizlik xatosi: Bajariluvchi dastur (.exe/PE binary) aniqlandi va rad etildi',
      );
    }
    // Linux ELF: "\x7fELF"
    if (
      buffer[0] === 0x7f &&
      buffer[1] === 0x45 &&
      buffer[2] === 0x4c &&
      buffer[3] === 0x46
    ) {
      throw new BadRequestException(
        'Xavfsizlik xatosi: Bajariluvchi ELF binar fayl aniqlandi va rad etildi',
      );
    }
    // Shell script: "#!"
    if (buffer[0] === 0x23 && buffer[1] === 0x21) {
      throw new BadRequestException(
        'Xavfsizlik xatosi: Bajariluvchi skript (shell script) aniqlandi va rad etildi',
      );
    }

    // 2. Validate legitimate resume document formats
    // PDF signature: "%PDF-"
    if (
      buffer.length >= 5 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    ) {
      return { valid: true, mime: 'application/pdf' };
    }

    // DOCX / ZIP signature: PK\x03\x04
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04 &&
      /\.docx$/i.test(originalname)
    ) {
      return {
        valid: true,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }

    // PNG signature: \x89PNG\r\n\x1a\n
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { valid: true, mime: 'image/png' };
    }

    // JPEG signature: \xFF\xD8\xFF
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return { valid: true, mime: 'image/jpeg' };
    }

    throw new BadRequestException(
      'Yaroqsiz fayl signaturasi. Faqat PDF, DOCX yoki rasm formatidagi rezyumelar qabul qilinadi.',
    );
  }

  /**
   * Performs heuristic and signature-based malware scanning on file buffer.
   * Checks for:
   * - EICAR standard antivirus test signature
   * - Dangerous VBA active macros in office documents (vbaProject.bin)
   * - PDF malicious script triggers (/Launch, /JavaScript)
   * - Optional ClamAV daemon via TCP socket
   */
  async scanBuffer(buffer: Buffer, originalname: string): Promise<ScanResult> {
    const rawString = buffer.toString('binary');

    // 1. EICAR Standard Antivirus Test Pattern
    if (rawString.includes(EICAR_STRING)) {
      this.logger.warn(`Malware detected: EICAR test string found in ${originalname}`);
      return {
        isClean: false,
        threatName: 'Eicar-Test-Signature',
        detectedSignature: 'EICAR Standard Test File',
      };
    }

    // 2. Check for VBA macros in DOCX archives
    if (/\.docx$/i.test(originalname)) {
      if (rawString.includes('vbaProject.bin') || rawString.includes('word/vbaData.xml')) {
        this.logger.warn(`Malicious active macro detected in DOCX: ${originalname}`);
        return {
          isClean: false,
          threatName: 'Macro.VBA.Embedded',
          detectedSignature: 'Embedded VBA Project',
        };
      }
    }

    // 3. Check for hostile PDF action dictionaries
    if (/\.pdf$/i.test(originalname)) {
      if (
        rawString.includes('/Launch') ||
        (rawString.includes('/JavaScript') && rawString.includes('/EmbeddedFiles'))
      ) {
        this.logger.warn(`Suspicious PDF executable action detected: ${originalname}`);
        return {
          isClean: false,
          threatName: 'Exploit.PDF.LaunchScript',
          detectedSignature: 'PDF Launch / JavaScript exploit trigger',
        };
      }
    }

    // 4. ClamAV TCP Daemon integration (if configured)
    const clamHost = process.env.CLAMAV_HOST;
    const clamPort = parseInt(process.env.CLAMAV_PORT || '3310', 10);

    if (clamHost) {
      try {
        const clamResult = await this.scanWithClamAv(buffer, clamHost, clamPort);
        if (!clamResult.isClean) {
          return clamResult;
        }
      } catch (err) {
        this.logger.warn(`ClamAV scan skipped: ${(err as Error).message}`);
      }
    }

    return { isClean: true };
  }

  /**
   * Scans a buffer with ClamAV clamd daemon using INSTREAM protocol.
   */
  private scanWithClamAv(
    buffer: Buffer,
    host: string,
    port: number,
    timeoutMs = 5000,
  ): Promise<ScanResult> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let response = '';

      socket.setTimeout(timeoutMs);

      socket.connect(port, host, () => {
        // Send INSTREAM command
        socket.write('zINSTREAM\0');

        // Write buffer chunks with 4-byte big endian length prefix
        const chunkSize = 2048;
        for (let i = 0; i < buffer.length; i += chunkSize) {
          const chunk = buffer.subarray(i, i + chunkSize);
          const sizeHeader = Buffer.alloc(4);
          sizeHeader.writeUInt32BE(chunk.length, 0);
          socket.write(sizeHeader);
          socket.write(chunk);
        }

        // Send 0-length terminator
        const terminator = Buffer.alloc(4);
        terminator.writeUInt32BE(0, 0);
        socket.write(terminator);
      });

      socket.on('data', (data) => {
        response += data.toString();
      });

      socket.on('end', () => {
        if (response.includes('FOUND')) {
          const match = response.match(/stream:\s+(.+)\s+FOUND/);
          resolve({
            isClean: false,
            threatName: match ? match[1] : 'ClamAV.Threat.Detected',
          });
        } else {
          resolve({ isClean: true });
        }
      });

      socket.on('error', () => {
        // In case clamd is not reachable, fallback to heuristic clean
        resolve({ isClean: true });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ isClean: true });
      });
    });
  }
}
