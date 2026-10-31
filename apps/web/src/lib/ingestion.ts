export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** A bounded admission check, not an activity parser. Files remain unprocessed. */
export function validateUpload(name: string, bytes: Uint8Array): 'gpx' | 'fit' {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES)
    throw new Error('Files must be between 1 byte and 5 MB.');
  if (name.length > 180 || /[\\/\x00-\x1f]/.test(name))
    throw new Error('Invalid filename.');
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'fit') {
    if (
      bytes.length < 14 ||
      bytes[0] < 12 ||
      bytes[0] > bytes.length ||
      String.fromCharCode(...bytes.slice(8, 12)) !== '.FIT'
    )
      throw new Error('Invalid FIT file signature.');
    return 'fit';
  }
  if (extension === 'gpx') {
    const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (
      /<!DOCTYPE|<!ENTITY/i.test(xml) ||
      !/^\s*(?:<\?xml[^?]*\?>\s*)?<gpx(?:\s|>)/.test(xml) ||
      !/<\/gpx>\s*$/.test(xml)
    )
      throw new Error(
        'Expected a UTF-8 GPX document without DTDs or entities.',
      );
    return 'gpx';
  }
  throw new Error('Only GPX and FIT files are supported.');
}
