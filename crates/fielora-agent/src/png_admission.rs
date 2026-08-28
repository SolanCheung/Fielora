//! Strict, bounded PNG admission owned by Fielora.
//!
//! The `png` crate is a decoder implementation detail. This module is the
//! security boundary: it admits a deliberately small static PNG subset and
//! preserves the exact original encoded bytes.

use crate::AgentError;
use png::{BitDepth, ColorType, DecodeOptions, Decoder, Limits, Transformations};
use sha2::{Digest, Sha256};
use std::io::Cursor;

pub const MAX_PNG_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_PNG_WIDTH: u32 = 4096;
pub const MAX_PNG_HEIGHT: u32 = 4096;
pub const MAX_PNG_PIXELS: u64 = 16_777_216;
pub const MAX_DECODED_BYTES: usize = 64 * 1024 * 1024;
const MAX_CHUNKS: usize = 128;
const SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdmittedPng {
    bytes: Vec<u8>,
    pub content_sha256: String,
    pub byte_length: u64,
    pub width: u32,
    pub height: u32,
}

impl AdmittedPng {
    pub const MEDIA_TYPE: &'static str = "image/png";

    pub fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }

    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PngStructureFacts {
    pub width: u32,
    pub height: u32,
}

pub fn admit(bytes: Vec<u8>) -> Result<AdmittedPng, AgentError> {
    let facts = validate_static_structure(&bytes)?;
    full_decode(&bytes, facts)?;
    let content_sha256 = format!("{:x}", Sha256::digest(&bytes));
    let byte_length = u64::try_from(bytes.len()).map_err(|_| AgentError::PngTooLarge)?;
    Ok(AdmittedPng {
        bytes,
        content_sha256,
        byte_length,
        width: facts.width,
        height: facts.height,
    })
}

/// Cheap export-time revalidation. Creation already performed full decode;
/// immutable blob identity is rechecked separately by the content blob store.
pub fn validate_static_structure(bytes: &[u8]) -> Result<PngStructureFacts, AgentError> {
    if bytes.len() > MAX_PNG_BYTES {
        return Err(AgentError::PngTooLarge);
    }
    if bytes.len() < SIGNATURE.len() || &bytes[..SIGNATURE.len()] != SIGNATURE {
        return Err(AgentError::PngInvalid);
    }

    let mut offset = SIGNATURE.len();
    let mut chunks = 0usize;
    let mut seen_ihdr = false;
    let mut seen_idat = false;
    let mut idat_closed = false;
    let mut seen_iend = false;
    let mut seen_srgb = false;
    let mut seen_gama = false;
    let mut seen_phys = false;
    let mut dimensions = None;

    while offset < bytes.len() {
        chunks = chunks.checked_add(1).ok_or(AgentError::PngTooLarge)?;
        if chunks > MAX_CHUNKS {
            return Err(AgentError::PngTooLarge);
        }
        let header_end = offset.checked_add(8).ok_or(AgentError::PngInvalid)?;
        if header_end > bytes.len() {
            return Err(AgentError::PngInvalid);
        }
        let length = u32::from_be_bytes(
            bytes[offset..offset + 4]
                .try_into()
                .map_err(|_| AgentError::PngInvalid)?,
        ) as usize;
        let chunk_type: [u8; 4] = bytes[offset + 4..offset + 8]
            .try_into()
            .map_err(|_| AgentError::PngInvalid)?;
        if !chunk_type.iter().all(|byte| byte.is_ascii_alphabetic())
            || chunk_type[2].is_ascii_lowercase()
        {
            return Err(AgentError::PngInvalid);
        }
        let data_end = header_end
            .checked_add(length)
            .ok_or(AgentError::PngInvalid)?;
        let chunk_end = data_end.checked_add(4).ok_or(AgentError::PngInvalid)?;
        if chunk_end > bytes.len() {
            return Err(AgentError::PngInvalid);
        }
        let data = &bytes[header_end..data_end];
        let expected_crc = u32::from_be_bytes(
            bytes[data_end..chunk_end]
                .try_into()
                .map_err(|_| AgentError::PngInvalid)?,
        );
        if png_crc32(&bytes[offset + 4..data_end]) != expected_crc {
            return Err(AgentError::PngInvalid);
        }

        if !seen_ihdr && &chunk_type != b"IHDR" {
            return Err(AgentError::PngInvalid);
        }
        if seen_iend {
            return Err(AgentError::PngTrailingData);
        }
        if seen_idat && &chunk_type != b"IDAT" && &chunk_type != b"IEND" {
            idat_closed = true;
        }

        match &chunk_type {
            b"IHDR" => {
                if seen_ihdr || chunks != 1 || data.len() != 13 {
                    return Err(AgentError::PngInvalid);
                }
                seen_ihdr = true;
                let width = u32::from_be_bytes(data[0..4].try_into().unwrap());
                let height = u32::from_be_bytes(data[4..8].try_into().unwrap());
                validate_ihdr(
                    width, height, data[8], data[9], data[10], data[11], data[12],
                )?;
                dimensions = Some(PngStructureFacts { width, height });
            }
            b"IDAT" => {
                if !seen_ihdr || idat_closed || data.is_empty() {
                    return Err(AgentError::PngInvalid);
                }
                seen_idat = true;
            }
            b"IEND" => {
                if !seen_idat || seen_iend || !data.is_empty() {
                    return Err(AgentError::PngInvalid);
                }
                seen_iend = true;
                if chunk_end != bytes.len() {
                    return Err(AgentError::PngTrailingData);
                }
            }
            b"acTL" | b"fcTL" | b"fdAT" => {
                return Err(AgentError::PngAnimatedUnsupported);
            }
            b"tEXt" | b"zTXt" | b"iTXt" | b"iCCP" | b"eXIf" => {
                return Err(AgentError::PngMetadataUnsupported);
            }
            b"PLTE" | b"tRNS" => return Err(AgentError::PngFormatUnsupported),
            b"sRGB" => {
                if seen_idat || seen_srgb || data.len() != 1 || data[0] > 3 {
                    return Err(AgentError::PngInvalid);
                }
                seen_srgb = true;
            }
            b"gAMA" => {
                if seen_idat || seen_gama || data.len() != 4 {
                    return Err(AgentError::PngInvalid);
                }
                seen_gama = true;
            }
            b"pHYs" => {
                if seen_idat || seen_phys || data.len() != 9 || data[8] > 1 {
                    return Err(AgentError::PngInvalid);
                }
                seen_phys = true;
            }
            _ => return Err(AgentError::PngFormatUnsupported),
        }
        offset = chunk_end;
    }

    if !seen_ihdr || !seen_idat || !seen_iend || offset != bytes.len() {
        return Err(AgentError::PngInvalid);
    }
    dimensions.ok_or(AgentError::PngInvalid)
}

fn validate_ihdr(
    width: u32,
    height: u32,
    bit_depth: u8,
    color_type: u8,
    compression: u8,
    filter: u8,
    interlace: u8,
) -> Result<(), AgentError> {
    if width == 0 || height == 0 {
        return Err(AgentError::PngInvalid);
    }
    let pixels = u64::from(width)
        .checked_mul(u64::from(height))
        .ok_or(AgentError::PngTooLarge)?;
    if width > MAX_PNG_WIDTH || height > MAX_PNG_HEIGHT || pixels > MAX_PNG_PIXELS {
        return Err(AgentError::PngTooLarge);
    }
    if compression != 0 || filter != 0 {
        return Err(AgentError::PngFormatUnsupported);
    }
    if interlace != 0 {
        return Err(AgentError::PngInterlacedUnsupported);
    }
    if bit_depth != 8 || !matches!(color_type, 0 | 2 | 4 | 6) {
        return Err(AgentError::PngFormatUnsupported);
    }
    let channels = match color_type {
        0 => 1usize,
        2 => 3,
        4 => 2,
        6 => 4,
        _ => unreachable!(),
    };
    let decoded = usize::try_from(pixels)
        .ok()
        .and_then(|value| value.checked_mul(channels))
        .ok_or(AgentError::PngTooLarge)?;
    if decoded > MAX_DECODED_BYTES {
        return Err(AgentError::PngTooLarge);
    }
    Ok(())
}

fn full_decode(bytes: &[u8], expected: PngStructureFacts) -> Result<(), AgentError> {
    let mut options = DecodeOptions::default();
    options.set_ignore_checksums(false);
    options.set_skip_ancillary_crc_failures(false);
    options.set_ignore_text_chunk(true);
    options.set_ignore_iccp_chunk(true);
    let mut decoder = Decoder::new_with_options(Cursor::new(bytes), options);
    decoder.set_limits(Limits {
        bytes: MAX_DECODED_BYTES,
    });
    decoder.set_transformations(Transformations::IDENTITY);
    let mut reader = decoder.read_info().map_err(|_| AgentError::PngInvalid)?;
    let info = reader.info();
    if info.width != expected.width
        || info.height != expected.height
        || info.bit_depth != BitDepth::Eight
        || !matches!(
            info.color_type,
            ColorType::Grayscale | ColorType::Rgb | ColorType::GrayscaleAlpha | ColorType::Rgba
        )
        || info.interlaced
        || info.animation_control.is_some()
    {
        return Err(AgentError::PngFormatUnsupported);
    }
    let output_size = reader.output_buffer_size().ok_or(AgentError::PngTooLarge)?;
    if output_size == 0 || output_size > MAX_DECODED_BYTES {
        return Err(AgentError::PngTooLarge);
    }
    let mut decoded = vec![0; output_size];
    let output = reader
        .next_frame(&mut decoded)
        .map_err(|_| AgentError::PngInvalid)?;
    if output.width != expected.width
        || output.height != expected.height
        || output.bit_depth != BitDepth::Eight
        || output.buffer_size() != output_size
    {
        return Err(AgentError::PngInvalid);
    }
    reader.finish().map_err(|_| AgentError::PngInvalid)?;
    drop(decoded);
    Ok(())
}

fn png_crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !crc
}

#[cfg(test)]
mod tests {
    use super::*;
    use png::{BitDepth, ColorType, Encoder};

    fn encoded(color: ColorType, data: &[u8]) -> Vec<u8> {
        encoded_dimensions(color, 2, 2, data)
    }

    fn encoded_dimensions(color: ColorType, width: u32, height: u32, data: &[u8]) -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut encoder = Encoder::new(&mut bytes, width, height);
            encoder.set_color(color);
            encoder.set_depth(BitDepth::Eight);
            let mut writer = encoder.write_header().unwrap();
            writer.write_image_data(data).unwrap();
        }
        bytes
    }

    fn replace_ihdr(mut bytes: Vec<u8>, data_index: usize, value: u8) -> Vec<u8> {
        bytes[16 + data_index] = value;
        let crc = png_crc32(&bytes[12..29]);
        bytes[29..33].copy_from_slice(&crc.to_be_bytes());
        bytes
    }

    fn insert_before_idat(mut bytes: Vec<u8>, kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
        let idat = bytes.windows(4).position(|value| value == b"IDAT").unwrap() - 4;
        let mut chunk = Vec::new();
        chunk.extend_from_slice(&(data.len() as u32).to_be_bytes());
        chunk.extend_from_slice(kind);
        chunk.extend_from_slice(data);
        chunk.extend_from_slice(&png_crc32(&chunk[4..]).to_be_bytes());
        bytes.splice(idat..idat, chunk);
        bytes
    }

    fn split_idat(mut bytes: Vec<u8>, pieces: usize) -> Vec<u8> {
        let type_offset = bytes.windows(4).position(|value| value == b"IDAT").unwrap();
        let chunk_offset = type_offset - 4;
        let length =
            u32::from_be_bytes(bytes[chunk_offset..type_offset].try_into().unwrap()) as usize;
        let data = bytes[type_offset + 4..type_offset + 4 + length].to_vec();
        assert!(pieces > 0 && data.len() >= pieces);
        let chunk_end = type_offset + 8 + length;
        let mut chunks = Vec::new();
        let mut start = 0usize;
        for index in 0..pieces {
            let remaining = data.len() - start;
            let remaining_pieces = pieces - index;
            let take = remaining.div_ceil(remaining_pieces);
            let part = &data[start..start + take];
            chunks.extend_from_slice(&(part.len() as u32).to_be_bytes());
            chunks.extend_from_slice(b"IDAT");
            chunks.extend_from_slice(part);
            chunks.extend_from_slice(
                &png_crc32(&chunks[chunks.len() - part.len() - 4..]).to_be_bytes(),
            );
            start += take;
        }
        bytes.splice(chunk_offset..chunk_end, chunks);
        bytes
    }

    fn rgb() -> Vec<u8> {
        encoded(ColorType::Rgb, &[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    }

    #[test]
    fn admits_exact_supported_static_formats() {
        for bytes in [
            encoded(ColorType::Rgb, &[0; 12]),
            encoded(ColorType::Rgba, &[0; 16]),
            encoded(ColorType::Grayscale, &[0; 4]),
            encoded(ColorType::GrayscaleAlpha, &[0; 8]),
        ] {
            let admitted = admit(bytes.clone()).unwrap();
            assert_eq!(admitted.bytes(), bytes);
            assert_eq!((admitted.width, admitted.height), (2, 2));
            assert_eq!(admitted.byte_length, bytes.len() as u64);
        }
    }

    #[test]
    fn rejects_signature_truncation_crc_and_missing_iend() {
        let bytes = rgb();
        let mut bad_signature = bytes.clone();
        bad_signature[0] = 0;
        assert_eq!(admit(bad_signature).unwrap_err(), AgentError::PngInvalid);
        assert!(admit(bytes[..20].to_vec()).is_err());
        let mut bad_crc = bytes.clone();
        bad_crc[29] ^= 1;
        assert_eq!(admit(bad_crc).unwrap_err(), AgentError::PngInvalid);
        assert!(admit(bytes[..bytes.len() - 12].to_vec()).is_err());
    }

    #[test]
    fn rejects_bounds_interlace_palette_and_sixteen_bit() {
        let bytes = rgb();
        let mut zero_width = bytes.clone();
        zero_width[16..20].copy_from_slice(&0u32.to_be_bytes());
        let crc = png_crc32(&zero_width[12..29]);
        zero_width[29..33].copy_from_slice(&crc.to_be_bytes());
        assert!(matches!(admit(zero_width), Err(AgentError::PngInvalid)));
        let mut oversized = bytes.clone();
        oversized[16..20].copy_from_slice(&4097u32.to_be_bytes());
        let crc = png_crc32(&oversized[12..29]);
        oversized[29..33].copy_from_slice(&crc.to_be_bytes());
        assert_eq!(admit(oversized).unwrap_err(), AgentError::PngTooLarge);
        assert_eq!(
            admit(replace_ihdr(bytes.clone(), 12, 1)).unwrap_err(),
            AgentError::PngInterlacedUnsupported
        );
        assert_eq!(
            admit(replace_ihdr(bytes.clone(), 9, 3)).unwrap_err(),
            AgentError::PngFormatUnsupported
        );
        assert_eq!(
            admit(replace_ihdr(bytes, 8, 16)).unwrap_err(),
            AgentError::PngFormatUnsupported
        );
    }

    #[test]
    fn rejects_animation_metadata_palette_and_unknown_chunks() {
        let bytes = rgb();
        for kind in [b"acTL", b"fcTL", b"fdAT"] {
            assert_eq!(
                admit(insert_before_idat(bytes.clone(), kind, &[0; 8])).unwrap_err(),
                AgentError::PngAnimatedUnsupported
            );
        }
        for kind in [b"tEXt", b"zTXt", b"iTXt", b"iCCP", b"eXIf"] {
            assert_eq!(
                admit(insert_before_idat(bytes.clone(), kind, b"x")).unwrap_err(),
                AgentError::PngMetadataUnsupported
            );
        }
        for kind in [b"PLTE", b"tRNS", b"vpAg", b"aaAa"] {
            assert_eq!(
                admit(insert_before_idat(bytes.clone(), kind, b"x")).unwrap_err(),
                AgentError::PngFormatUnsupported
            );
        }
    }

    #[test]
    fn rejects_trailing_polyglots_and_malformed_deflate_or_adler() {
        for suffix in [
            b"PK\x03\x04".as_slice(),
            b"<html>".as_slice(),
            b"MZ".as_slice(),
        ] {
            let mut bytes = rgb();
            bytes.extend_from_slice(suffix);
            assert_eq!(admit(bytes).unwrap_err(), AgentError::PngTrailingData);
        }
        let mut malformed = rgb();
        let idat = malformed
            .windows(4)
            .position(|value| value == b"IDAT")
            .unwrap();
        malformed[idat + 4] ^= 0xff;
        let length = u32::from_be_bytes(malformed[idat - 4..idat].try_into().unwrap()) as usize;
        let crc = png_crc32(&malformed[idat..idat + 4 + length]);
        malformed[idat + 4 + length..idat + 8 + length].copy_from_slice(&crc.to_be_bytes());
        assert_eq!(admit(malformed).unwrap_err(), AgentError::PngInvalid);

        let mut bad_adler = rgb();
        let idat = bad_adler
            .windows(4)
            .position(|value| value == b"IDAT")
            .unwrap();
        let length = u32::from_be_bytes(bad_adler[idat - 4..idat].try_into().unwrap()) as usize;
        bad_adler[idat + 3 + length] ^= 1;
        let crc = png_crc32(&bad_adler[idat..idat + 4 + length]);
        bad_adler[idat + 4 + length..idat + 8 + length].copy_from_slice(&crc.to_be_bytes());
        assert_eq!(admit(bad_adler).unwrap_err(), AgentError::PngInvalid);
    }

    #[test]
    fn encoded_and_decoded_resource_limits_fail_closed() {
        assert_eq!(
            admit(vec![0; MAX_PNG_BYTES + 1]).unwrap_err(),
            AgentError::PngTooLarge
        );
        let bytes = rgb();
        let mut oversized_height = bytes.clone();
        oversized_height[20..24].copy_from_slice(&4097u32.to_be_bytes());
        let crc = png_crc32(&oversized_height[12..29]);
        oversized_height[29..33].copy_from_slice(&crc.to_be_bytes());
        assert_eq!(
            admit(oversized_height).unwrap_err(),
            AgentError::PngTooLarge
        );
        let mut bomb = bytes;
        bomb[16..20].copy_from_slice(&4096u32.to_be_bytes());
        bomb[20..24].copy_from_slice(&4096u32.to_be_bytes());
        bomb[25] = 6;
        let crc = png_crc32(&bomb[12..29]);
        bomb[29..33].copy_from_slice(&crc.to_be_bytes());
        assert_eq!(admit(bomb).unwrap_err(), AgentError::PngInvalid);
    }

    #[test]
    fn chunk_count_duplicate_end_and_ancillary_crc_fail_closed() {
        let noisy = (0..128 * 128)
            .flat_map(|index| {
                let value = (index % 251) as u8;
                [value, value.wrapping_mul(17), value.wrapping_mul(31), 255]
            })
            .collect::<Vec<_>>();
        let many_chunks = split_idat(encoded_dimensions(ColorType::Rgba, 128, 128, &noisy), 127);
        assert_eq!(admit(many_chunks).unwrap_err(), AgentError::PngTooLarge);

        let mut duplicate_end = rgb();
        let iend = duplicate_end[duplicate_end.len() - 12..].to_vec();
        duplicate_end.extend_from_slice(&iend);
        assert_eq!(
            admit(duplicate_end).unwrap_err(),
            AgentError::PngTrailingData
        );

        let mut bad_ancillary_crc = insert_before_idat(rgb(), b"pHYs", &[0; 9]);
        let phys = bad_ancillary_crc
            .windows(4)
            .position(|value| value == b"pHYs")
            .unwrap();
        bad_ancillary_crc[phys + 4 + 9] ^= 1;
        assert_eq!(
            admit(bad_ancillary_crc).unwrap_err(),
            AgentError::PngInvalid
        );
    }
}
