const cheerio = require('cheerio');

const FONT_FAMILY_MAP = {
  arial: "font-family: Arial, sans-serif;",
  timesnewroman: "font-family: 'Times New Roman', Times, serif;",
  helvetica: "font-family: Helvetica, Arial, sans-serif;",
  georgia: "font-family: Georgia, serif;",
  verdana: "font-family: Verdana, Geneva, sans-serif;",
  trebuchetms: "font-family: 'Trebuchet MS', Helvetica, sans-serif;",
  tahoma: "font-family: Tahoma, Geneva, sans-serif;",
  couriernew: "font-family: 'Courier New', Courier, monospace;",
  lucidasansunicode: "font-family: 'Lucida Sans Unicode', 'Lucida Grande', sans-serif;",
  palatinolinotype: "font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, serif;",
  cambria: "font-family: Cambria, serif;",
  calistomt: "font-family: 'Calisto MT', serif;"
};

const FONT_SIZE_MAP = {
  small: 'font-size: 12px;',
  large: 'font-size: 18px;',
  huge: 'font-size: 26px;',
  // Pixel-based sizes from Quill SizeStyle attributor
  '8px': 'font-size: 8px;',
  '9px': 'font-size: 9px;',
  '10px': 'font-size: 10px;',
  '11px': 'font-size: 11px;',
  '12px': 'font-size: 12px;',
  '14px': 'font-size: 14px;',
  '16px': 'font-size: 16px;',
  '18px': 'font-size: 18px;',
  '20px': 'font-size: 20px;',
  '22px': 'font-size: 22px;',
  '24px': 'font-size: 24px;'
};

const ALIGNMENT_MAP = {
  center: 'text-align: center;',
  right: 'text-align: right;',
  justify: 'text-align: justify;'
};

const WRAPPER_STYLE = [
  "font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif",
  'font-size: 15px',
  'line-height: 1.15',
  'color: #111827',
  'word-break: break-word'
].join('; ');

const DEFAULT_PARAGRAPH_STYLE = 'margin: 0;';
const DEFAULT_LIST_MARGIN = 'margin: 0 0 0.85em 1.25em;';
const DEFAULT_LIST_PADDING = 'padding: 0 0 0 1.25em;';
const DEFAULT_LIST_ITEM_STYLE = 'margin: 0.35em 0;';

const isFormattingDisabled = process.env.DISABLE_RICH_EMAIL_HTML === 'true';
const isLoggingDisabled = process.env.DISABLE_EMAIL_HTML_LOG === 'true';
const LOG_PREVIEW_LENGTH = Number(process.env.EMAIL_HTML_LOG_PREVIEW || 2000);

const cssPropertyExists = (style, property) => {
  if (!style || !property) return false;
  const regex = new RegExp(`${property}\\s*:`, 'i');
  return regex.test(style);
};

const appendStyle = ($el, style) => {
  if (!$el || !style) return;
  const current = $el.attr('style');
  if (current && current.includes(style)) {
    return;
  }
  const normalized = current ? `${current.trim().replace(/;$/, '')}; ${style}` : style;
  $el.attr('style', normalized);
};

const ensureStyle = ($el, property, declaration) => {
  if (!$el || !property || !declaration) return;
  const current = $el.attr('style');
  if (cssPropertyExists(current, property)) {
    return;
  }
  appendStyle($el, declaration);
};

const applyQuillClass = ($el, className) => {
  if (!className) return false;

  if (className.startsWith('ql-font-')) {
    const key = className.replace('ql-font-', '');
    if (FONT_FAMILY_MAP[key]) {
      appendStyle($el, FONT_FAMILY_MAP[key]);
      return true;
    }
    return false;
  }

  if (className.startsWith('ql-size-')) {
    const key = className.replace('ql-size-', '');
    // Handle both class-based (ql-size-12px) and direct pixel values
    if (FONT_SIZE_MAP[key]) {
      appendStyle($el, FONT_SIZE_MAP[key]);
      return true;
    }
    // Also handle if the key itself is a pixel value (e.g., "12px")
    if (key.endsWith('px') && FONT_SIZE_MAP[key]) {
      appendStyle($el, FONT_SIZE_MAP[key]);
      return true;
    }
    return false;
  }

  if (className.startsWith('ql-align-')) {
    const key = className.replace('ql-align-', '');
    if (ALIGNMENT_MAP[key]) {
      appendStyle($el, ALIGNMENT_MAP[key]);
      return true;
    }
    return false;
  }

  if (className.startsWith('ql-indent-')) {
    const level = Number(className.replace('ql-indent-', '')) || 0;
    if (level > 0) {
      const padding = `padding-left: ${level * 1.5}em;`;
      appendStyle($el, padding);
      return true;
    }
    return false;
  }

  if (className === 'ql-direction-rtl') {
    appendStyle($el, 'direction: rtl; text-align: right;');
    return true;
  }

  if (className === 'ql-direction-ltr') {
    appendStyle($el, 'direction: ltr; text-align: left;');
    return true;
  }

  // Handle Quill color classes (ql-color-*)
  // Note: Quill typically uses inline styles for colors, but we handle classes too
  if (className.startsWith('ql-color-')) {
    const colorValue = className.replace('ql-color-', '');
    // Quill stores colors as hex values without #, or as color names
    const color = colorValue.startsWith('#') ? colorValue : `#${colorValue}`;
    appendStyle($el, `color: ${color};`);
    return true;
  }

  // Handle Quill background color classes (ql-bg-*)
  if (className.startsWith('ql-bg-')) {
    const bgColorValue = className.replace('ql-bg-', '');
    // Quill stores colors as hex values without #, or as color names
    const bgColor = bgColorValue.startsWith('#') ? bgColorValue : `#${bgColorValue}`;
    appendStyle($el, `background-color: ${bgColor};`);
    return true;
  }

  return false;
};

const formatEmailHtml = (inputHtml = '') => {
  if (isFormattingDisabled) {
    return inputHtml || '';
  }

  const html = inputHtml || '';
  const trimmed = html.trim();
  if (!trimmed) {
    return '';
  }

  const $ = cheerio.load(`<div id="__email-rich-root">${trimmed}</div>`, {
    decodeEntities: false
  });

  // First pass: Convert Quill classes to inline styles and preserve existing inline styles
  $('#__email-rich-root *').each((_, element) => {
    const $el = $(element);
    const classAttr = $el.attr('class');
    const existingStyle = $el.attr('style') || '';
    
    // Preserve ALL existing inline styles BEFORE processing classes
    // This ensures Quill's inline styles (font-size, font-family, color, etc.) are preserved
    const preservedStyles = {};
    
    if (existingStyle) {
      // Parse all existing style properties
      const stylePairs = existingStyle.split(';').filter(s => s.trim());
      stylePairs.forEach(pair => {
        const [prop, value] = pair.split(':').map(s => s.trim());
        if (prop && value) {
          preservedStyles[prop.toLowerCase()] = value;
        }
      });
    }
    
    if (!classAttr) {
      // Even without classes, ensure line-height is set if not present
      if (!preservedStyles['line-height']) {
        ensureStyle($el, 'line-height', 'line-height: 1.15;');
      }
      // Preserve all existing styles
      Object.keys(preservedStyles).forEach(prop => {
        if (prop && preservedStyles[prop] && prop !== 'line-height') {
          appendStyle($el, `${prop}: ${preservedStyles[prop]};`);
        }
      });
      return;
    }

    const classes = classAttr.split(/\s+/).filter(Boolean);
    if (classes.length === 0) {
      $el.removeAttr('class');
      if (!preservedStyles['line-height']) {
        ensureStyle($el, 'line-height', 'line-height: 1.15;');
      }
      // Restore all preserved styles
      Object.keys(preservedStyles).forEach(prop => {
        if (prop && preservedStyles[prop] && prop !== 'line-height') {
          appendStyle($el, `${prop}: ${preservedStyles[prop]};`);
        }
      });
      return;
    }

    const classesToKeep = [];
    classes.forEach((cls) => {
      const handled = applyQuillClass($el, cls);
      if (!handled) {
        classesToKeep.push(cls);
      }
    });

    // Restore preserved styles AFTER applying Quill classes
    // This ensures inline styles from Quill take precedence, but we restore if missing
    const currentStyle = $el.attr('style') || '';
    Object.keys(preservedStyles).forEach(prop => {
      if (prop && preservedStyles[prop] && !cssPropertyExists(currentStyle, prop)) {
        appendStyle($el, `${prop}: ${preservedStyles[prop]};`);
      }
    });

    if (classesToKeep.length > 0) {
      $el.attr('class', classesToKeep.join(' '));
    } else {
      $el.removeAttr('class');
    }
    
    // Ensure line-height is set only if not already present (preserve user-defined spacing)
    const finalStyle = $el.attr('style') || '';
    if (!cssPropertyExists(finalStyle, 'line-height')) {
      ensureStyle($el, 'line-height', 'line-height: 1.15;');
    }
    // Preserve margin-bottom if it exists (user-defined paragraph spacing)
    // Don't override it with DEFAULT_PARAGRAPH_STYLE
  });

  // Apply line-height 1.15 to all text elements only if not already set
  // This preserves user-defined line spacing from the editor
  $('#__email-rich-root p, #__email-rich-root div, #__email-rich-root span, #__email-rich-root li, #__email-rich-root td, #__email-rich-root th').each((_, element) => {
    const $el = $(element);
    const currentStyle = $el.attr('style') || '';
    // Only apply if line-height is not already set (preserve user-defined spacing)
    if (!cssPropertyExists(currentStyle, 'line-height')) {
      ensureStyle($el, 'line-height', 'line-height: 1.15;');
    }
  });
  
  // Apply paragraph margin only if margin-bottom is not already set
  // This preserves user-defined paragraph spacing from the editor
  $('#__email-rich-root p').each((_, element) => {
    const $el = $(element);
    const currentStyle = $el.attr('style') || '';
    // Only apply default margin if margin-bottom is not already set
    if (!cssPropertyExists(currentStyle, 'margin-bottom')) {
      ensureStyle($el, 'margin', DEFAULT_PARAGRAPH_STYLE);
    }
  });
  $('#__email-rich-root ul, #__email-rich-root ol').each((_, element) => ensureStyle($(element), 'margin', DEFAULT_LIST_MARGIN));
  $('#__email-rich-root ul, #__email-rich-root ol').each((_, element) => ensureStyle($(element), 'padding', DEFAULT_LIST_PADDING));
  $('#__email-rich-root li').each((_, element) => ensureStyle($(element), 'margin', DEFAULT_LIST_ITEM_STYLE));

  // Fix links for email client compatibility (especially Outlook and Yahoo)
  $('#__email-rich-root a').each((_, element) => {
    const $link = $(element);
    let href = $link.attr('href');
    
    // Ensure href exists and is valid
    if (!href || href.trim() === '' || href === '#') {
      // If no valid href, try to extract from text content
      const linkText = $link.text().trim();
      if (linkText && (linkText.startsWith('http://') || linkText.startsWith('https://'))) {
        href = linkText;
        $link.attr('href', href);
      } else if (linkText && linkText.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}/)) {
        // Looks like a URL without protocol
        href = `https://${linkText}`;
        $link.attr('href', href);
      } else {
        // Remove invalid links and replace with plain text
        $link.replaceWith($link.html() || $link.text());
        return;
      }
    }
    
    // Ensure href is absolute (add protocol if missing)
    let finalHref = href.trim();
    if (finalHref && !finalHref.match(/^(https?|mailto|tel|ftp):/i)) {
      // If it looks like a URL but missing protocol, add https://
      if (finalHref.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}/)) {
        finalHref = `https://${finalHref}`;
        $link.attr('href', finalHref);
      }
    }
    
    // Clean up href - remove any whitespace or invalid characters
    finalHref = finalHref.replace(/\s+/g, '').replace(/[<>"]/g, '');
    $link.attr('href', finalHref);
    
    // Add email-client-friendly styles for links (Outlook/Yahoo compatible)
    const linkStyle = $link.attr('style') || '';
    const stylesToAdd = [];
    
    if (!cssPropertyExists(linkStyle, 'color')) {
      stylesToAdd.push('color: #2563eb;');
    }
    if (!cssPropertyExists(linkStyle, 'text-decoration')) {
      stylesToAdd.push('text-decoration: underline;');
    }
    
    // Add styles if needed
    if (stylesToAdd.length > 0) {
      stylesToAdd.forEach(style => appendStyle($link, style));
    }
    
    // Ensure link text is not empty (Outlook requirement)
    const linkContent = $link.html().trim() || $link.text().trim();
    if (!linkContent) {
      $link.text(finalHref);
    }
    
    // Handle target attribute for email clients
    if ($link.attr('target') === '_blank') {
      // Keep target="_blank" but ensure rel="noopener" for security
      if (!$link.attr('rel')) {
        $link.attr('rel', 'noopener noreferrer');
      }
    } else {
      // Remove target if it's not _blank (some email clients don't like other targets)
      $link.removeAttr('target');
    }
    
    // Ensure link is not nested in a way that breaks Outlook
    // Outlook doesn't like links inside certain block elements in certain ways
    const parent = $link.parent();
    if (parent.length && parent.is('p, div')) {
      // Ensure the link has proper display for Outlook
      const currentDisplay = parent.attr('style') || '';
      if (!cssPropertyExists(currentDisplay, 'display')) {
        // Don't modify parent, but ensure link itself is inline
        if (!cssPropertyExists(linkStyle, 'display')) {
          appendStyle($link, 'display: inline;');
        }
      }
    }
  });

  let formatted = $('#__email-rich-root').html();
  if (!formatted) {
    return '';
  }

  // Wrap in container div, but don't override existing font styles
  // The wrapper provides default styles, but inline styles on elements take precedence
  if (!/data-rich-email-wrapper/.test(formatted)) {
    formatted = `<div data-rich-email-wrapper="true" style="${WRAPPER_STYLE}">${formatted}</div>`;
  }

  return formatted;
};

const logEmailHtmlPayload = (context, html) => {
  if (isLoggingDisabled) {
    return;
  }

  const safeContext = context || 'email';
  const payload = html || '';
  const previewLimit = Number.isFinite(LOG_PREVIEW_LENGTH) ? LOG_PREVIEW_LENGTH : 2000;
  const preview = payload.length > previewLimit ? `${payload.slice(0, previewLimit)} …(truncated)` : payload;

  console.log(`📄 [EmailHtml:${safeContext}] length=${payload.length}`);
  if (preview) {
    console.log(preview);
  }
};

module.exports = {
  formatEmailHtml,
  logEmailHtmlPayload
};

