const DEFAULT_ENCODING = 'base64';

const sanitizeAttachmentsForStorage = (rawAttachments) => {
  if (!Array.isArray(rawAttachments)) {
    return [];
  }

  return rawAttachments
    .map((attachment) => {
      if (!attachment || typeof attachment !== 'object') {
        return null;
      }

      const filename = attachment.filename || attachment.name || 'attachment';
      const contentType = attachment.contentType || attachment.type || null;
      const size = attachment.size !== undefined ? Number(attachment.size) : null;
      const encoding = attachment.encoding || (attachment.content ? DEFAULT_ENCODING : undefined);
      const content = typeof attachment.content === 'string' ? attachment.content : null;

      const sanitized = {
        id: attachment.id,
        name: attachment.name || filename,
        filename,
        size: Number.isFinite(size) ? size : null,
        type: attachment.type || contentType || null,
        contentType,
        encoding,
        content,
        cid: attachment.cid,
        disposition: attachment.disposition
      };

      Object.keys(sanitized).forEach((key) => {
        if (sanitized[key] === undefined) {
          delete sanitized[key];
        }
      });

      return sanitized;
    })
    .filter(Boolean);
};

const prepareAttachmentsForSending = (rawAttachments) => {
  if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) {
    return [];
  }

  return rawAttachments
    .map((attachment) => {
      if (!attachment || typeof attachment !== 'object') {
        return null;
      }

      if (attachment.path) {
        return {
          filename: attachment.filename || attachment.name,
          path: attachment.path,
          contentType: attachment.contentType || attachment.type,
          cid: attachment.cid,
          disposition: attachment.disposition
        };
      }

      if (typeof attachment.content === 'string' && attachment.content.length > 0) {
        const encoding = attachment.encoding || DEFAULT_ENCODING;
        try {
          const buffer = Buffer.from(attachment.content, encoding);
          return {
            filename: attachment.filename || attachment.name || 'attachment',
            content: buffer,
            contentType: attachment.contentType || attachment.type,
            cid: attachment.cid,
            disposition: attachment.disposition
          };
        } catch (error) {
          console.warn('Failed to prepare attachment for sending:', error.message);
          return null;
        }
      }

      return null;
    })
    .filter(Boolean);
};

module.exports = {
  sanitizeAttachmentsForStorage,
  prepareAttachmentsForSending
};

