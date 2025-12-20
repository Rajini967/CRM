import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Plus,
  Edit,
  Trash2,
  Mail,
  Paperclip,
  X,
  Upload,
  Download,
  Code,
  User,
  Building,
  Globe,
  Calendar,
  MapPin,
  File,
  ArrowLeft,
  ChevronRight,
  Search,
  Filter,
  Grid3x3,
  List
} from 'lucide-react';
import ReactQuill, { Quill } from 'react-quill';
import 'react-quill/dist/quill.snow.css';

// Register font whitelist to match email compose editor
const Font = Quill.import('formats/font');
Font.whitelist = [
  'arial',
  'calistomt',
  'cambria',
  'couriernew',
  'georgia',
  'helvetica',
  'lucidasansunicode',
  'palatinolinotype',
  'tahoma',
  'timesnewroman',
  'trebuchetms',
  'verdana'
];
Quill.register(Font, true);

// Register numeric font sizes using style attributor (pixel values)
const SizeStyle = Quill.import('attributors/style/size');
SizeStyle.whitelist = ['8px', '9px', '10px', '11px', '12px', '14px', '16px', '18px', '20px', '22px', '24px'];
Quill.register(SizeStyle, true);

// Register line-height as style attributor using Parchment
// Use BLOCK scope so it applies to entire paragraphs (like Word)
const Parchment = Quill.import('parchment');
const LineHeightAttributor = new Parchment.Attributor.Style('line-height', 'line-height', {
  scope: Parchment.Scope.BLOCK,
  whitelist: ['1.0', '1.15', '1.5', '1.75', '2.0', '2.5', '3.0']
});
Quill.register(LineHeightAttributor, true);

// Register margin-bottom as style attributor using Parchment (paragraph spacing)
const MarginBottomAttributor = new Parchment.Attributor.Style('margin-bottom', 'margin-bottom', {
  scope: Parchment.Scope.BLOCK,
  whitelist: ['0', '0.5em', '1em', '1.5em', '2em', '2.5em', '3em']
});
Quill.register(MarginBottomAttributor, true);

// Create custom Picker for line spacing
const Picker = Quill.import('ui/picker');
class LineSpacingPicker extends Picker {
  constructor(select, options) {
    super(select);
    this.options = options || {};
  }
  
  static values = ['1.0', '1.15', '1.5', '1.75', '2.0', '2.5', '3.0'];
  
  static value(quill) {
    const selection = quill.getSelection();
    if (!selection) return null;
    const format = quill.getFormat(selection);
    return format['line-height'] || '1.15';
  }
}

// Create custom Picker for paragraph spacing
class ParagraphSpacingPicker extends Picker {
  constructor(select, options) {
    super(select);
    this.options = options || {};
  }
  
  static values = ['0', '0.5em', '1em', '1.5em', '2em', '2.5em', '3em'];
  
  static value(quill) {
    const selection = quill.getSelection();
    if (!selection) return null;
    const format = quill.getFormat(selection);
    return format['margin-bottom'] || '0';
  }
}

const quillModules = {
  toolbar: {
    container: [
      [{ header: [1, 2, 3, false] }],
      [{ font: ['arial', 'calistomt', 'cambria', 'couriernew', 'georgia', 'helvetica', 'lucidasansunicode', 'palatinolinotype', 'tahoma', 'timesnewroman', 'trebuchetms', 'verdana'] }],
      [{ size: ['8px', '9px', '10px', '11px', '12px', '14px', '16px', '18px', '20px', '22px', '24px', false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ color: [] }, { background: [] }],
      [{ 'line-spacing': ['1.0', '1.15', '1.5', '1.75', '2.0', '2.5', '3.0'] }],
      [{ 'paragraph-spacing': ['0', '0.5em', '1em', '1.5em', '2em', '2.5em', '3em'] }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ align: [] }],
      ['link', 'image'],
      ['clean']
    ],
    handlers: {
      'line-spacing': function(value) {
        const quill = this.quill;
        const selection = quill.getSelection(true);
        if (!selection) return;
        
        // Preserve selection to restore it after formatting
        const savedSelection = { index: selection.index, length: selection.length };
        
        // Get all blocks in the selection to apply line-height to all paragraphs
        const [startLine] = quill.getLine(selection.index);
        const [endLine] = quill.getLine(selection.index + selection.length);
        
        if (startLine && endLine) {
          const startIndex = quill.getIndex(startLine);
          const endIndex = quill.getIndex(endLine);
          
          // Apply to all paragraphs in selection
          for (let i = startIndex; i <= endIndex; i++) {
            const [line] = quill.getLine(i);
            if (line) {
              const lineIdx = quill.getIndex(line);
              const currentFormat = quill.getFormat(line);
              const currentLineHeight = currentFormat['line-height'] || '1.15';
              
              if (value === currentLineHeight) {
                quill.formatLine(lineIdx, 'line-height', false, 'user');
              } else {
                quill.formatLine(lineIdx, 'line-height', value, 'user');
              }
            }
          }
        } else if (startLine) {
          // Single paragraph
          const lineIndex = quill.getIndex(startLine);
          const currentFormat = quill.getFormat(startLine);
          const currentLineHeight = currentFormat['line-height'] || '1.15';
          
          if (value === currentLineHeight) {
            quill.formatLine(lineIndex, 'line-height', false, 'user');
          } else {
            quill.formatLine(lineIndex, 'line-height', value, 'user');
          }
        }
        
        // Restore selection
        setTimeout(() => {
          quill.setSelection(savedSelection.index, savedSelection.length, 'user');
        }, 0);
      },
      'paragraph-spacing': function(value) {
        const quill = this.quill;
        const selection = quill.getSelection(true);
        if (!selection) return;
        
        // Preserve selection to restore it after formatting
        const savedSelection = { index: selection.index, length: selection.length };
        
        // Get all blocks in the selection to apply margin-bottom to all paragraphs
        const [startLine] = quill.getLine(selection.index);
        const [endLine] = quill.getLine(selection.index + selection.length);
        
        if (startLine && endLine) {
          const startIndex = quill.getIndex(startLine);
          const endIndex = quill.getIndex(endLine);
          
          // Apply to all paragraphs in selection
          for (let i = startIndex; i <= endIndex; i++) {
            const [line] = quill.getLine(i);
            if (line) {
              const lineIdx = quill.getIndex(line);
              const currentFormat = quill.getFormat(line);
              const currentMargin = currentFormat['margin-bottom'] || '0';
              
              if (value === currentMargin) {
                quill.formatLine(lineIdx, 'margin-bottom', false, 'user');
              } else {
                quill.formatLine(lineIdx, 'margin-bottom', value, 'user');
              }
            }
          }
        } else if (startLine) {
          // Single paragraph
          const lineIndex = quill.getIndex(startLine);
          const currentFormat = quill.getFormat(startLine);
          const currentMargin = currentFormat['margin-bottom'] || '0';
          
          if (value === currentMargin) {
            quill.formatLine(lineIndex, 'margin-bottom', false, 'user');
          } else {
            quill.formatLine(lineIndex, 'margin-bottom', value, 'user');
          }
        }
        
        // Restore selection
        setTimeout(() => {
          quill.setSelection(savedSelection.index, savedSelection.length, 'user');
        }, 0);
      }
    }
  },
  keyboard: {
    bindings: {
      // Override Enter key to create paragraph with spacing (like Word)
      enter: {
        key: 'Enter',
        handler: function(range, context) {
          const quill = this.quill;
          
          // Get current block format BEFORE Enter is processed
          const [currentLine] = quill.getLine(range.index);
          if (!currentLine) return true;
          
          // Get format from the DOM element directly to avoid Quill's format changes
          const currentLineElement = currentLine.domNode || currentLine;
          const currentStyle = currentLineElement.getAttribute('style') || '';
          
          // Extract margin-bottom and line-height from inline styles
          let paragraphSpacing = '1em';
          let lineHeight = '1.15';
          
          if (currentStyle) {
            const marginMatch = currentStyle.match(/margin-bottom:\s*([^;]+)/i);
            if (marginMatch) {
              paragraphSpacing = marginMatch[1].trim();
            }
            const lineHeightMatch = currentStyle.match(/line-height:\s*([^;]+)/i);
            if (lineHeightMatch) {
              lineHeight = lineHeightMatch[1].trim();
            }
          }
          
          // Also try to get from Quill format as fallback
          if (!paragraphSpacing || paragraphSpacing === '') {
            const currentBlockFormat = quill.getFormat(currentLine);
            paragraphSpacing = currentBlockFormat['margin-bottom'] || '1em';
          }
          if (!lineHeight || lineHeight === '') {
            const currentBlockFormat = quill.getFormat(currentLine);
            lineHeight = currentBlockFormat['line-height'] || '1.15';
          }
          
          // Let Quill handle the default Enter behavior (creates new paragraph)
          // Use a more reliable approach with multiple event listeners
          let applied = false;
          const applyFormatting = () => {
            if (applied) return;
            const newRange = quill.getSelection(true);
            if (newRange) {
              const [newLine] = quill.getLine(newRange.index);
              if (newLine) {
                const lineIndex = quill.getIndex(newLine);
                // Apply both line-height and margin-bottom to new paragraph
                // Use setTimeout to ensure it happens after Quill's internal processing
                setTimeout(() => {
                  quill.formatLine(lineIndex, 'line-height', lineHeight, 'user');
                  quill.formatLine(lineIndex, 'margin-bottom', paragraphSpacing, 'user');
                }, 0);
                applied = true;
                quill.off('text-change', applyFormatting);
                quill.off('selection-change', applyFormatting);
              }
            }
          };
          
          // Listen for both text-change and selection-change to catch the new paragraph
          quill.once('text-change', applyFormatting);
          quill.once('selection-change', applyFormatting);
          
          // Fallback timeout with longer delay
          setTimeout(() => {
            if (!applied) {
              applyFormatting();
              quill.off('text-change', applyFormatting);
              quill.off('selection-change', applyFormatting);
            }
          }, 50);
          
          return true; // Allow default behavior
        }
      },
      // Shift+Enter creates line break without paragraph spacing (like Word)
      'shift enter': {
        key: 'Enter',
        shiftKey: true,
        handler: function(range, context) {
          const quill = this.quill;
          
          // Get current paragraph's line-height to preserve it
          const [currentLine] = quill.getLine(range.index);
          if (currentLine) {
            const currentBlockFormat = quill.getFormat(currentLine);
            const lineHeight = currentBlockFormat['line-height'] || '1.15';
            
            // After line break is created, ensure line-height is preserved
            const handler = () => {
              const newRange = quill.getSelection(true);
              if (newRange) {
                // Line break stays in same paragraph, so apply line-height to current paragraph
                const [line] = quill.getLine(newRange.index);
                if (line) {
                  const lineIndex = quill.getIndex(line);
                  quill.formatLine(lineIndex, 'line-height', lineHeight, 'user');
                }
              }
              quill.off('text-change', handler);
            };
            
            quill.once('text-change', handler);
          }
          
          // Quill's default Shift+Enter behavior creates a line break (<br>)
          // This stays within the same paragraph, so no paragraph spacing is added
          return true; // Allow default behavior
        }
      }
    }
  },
  clipboard: {
    // Preserve line breaks and formatting when pasting
    matchVisual: false,
    // Don't normalize HTML - preserve original formatting and spacing
    preserveWhitespace: true
  }
};

const quillFormats = [
  'header',
  'font',
  'size',
  'bold',
  'italic',
  'underline',
  'strike',
  'color',
  'background',
  'line-height',
  'margin-bottom',
  'list',
  'bullet',
  'align',
  'link',
  'image',
  'indent',
  'direction'
];

const TEMPLATE_EDITOR_STYLES = `
  .template-editor .ql-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    font-size: 14px;
    min-height: 0;
    border-radius: 0 0 0.5rem 0.5rem;
  }
  .template-editor .ql-editor {
    flex: 1;
    min-height: 250px;
    padding: 12px;
    text-align: left;
    line-height: 1.15;
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: pre-wrap; /* Preserve whitespace and line breaks */
  }
  /* Preserve spacing in paragraphs - margin-bottom will be applied via inline styles */
  .template-editor .ql-editor p {
    margin: 0;
    white-space: pre-wrap;
    /* Line-height will be applied via inline styles from Quill */
  }
  /* Ensure paragraphs with margin-bottom spacing are visible */
  .template-editor .ql-editor p[style*="margin-bottom"] {
    display: block;
  }
  /* Preserve empty paragraphs for spacing */
  .template-editor .ql-editor p:empty {
    min-height: 1em;
  }
  /* Preserve spacing in divs */
  .template-editor .ql-editor div {
    white-space: pre-wrap;
  }
  .template-editor .ql-editor.ql-blank::before {
    left: 12px;
    right: 12px;
    text-align: left;
    font-style: normal;
    color: #9ca3af;
  }
  .template-editor .ql-toolbar {
    border-top: 1px solid #e5e7eb;
    border-left: 1px solid #e5e7eb;
    border-right: 1px solid #e5e7eb;
    border-bottom: none;
    padding: 8px;
    border-radius: 0.5rem 0.5rem 0 0;
  }
  .template-editor .ql-toolbar .ql-formats {
    margin-right: 8px;
  }
  /* Line spacing and paragraph spacing picker styles */
  .template-editor .ql-toolbar .ql-picker.ql-line-spacing,
  .template-editor .ql-toolbar .ql-picker.ql-paragraph-spacing {
    width: 140px;
  }
  .template-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-label::before {
    content: 'Line Spacing';
  }
  .template-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-item[data-value="1.0"]::before { content: '1.0'; }
  .template-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-item[data-value="1.15"]::before { content: '1.15'; }
  .template-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-item[data-value="1.5"]::before { content: '1.5'; }
  .template-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-item[data-value="1.75"]::before { content: '1.75'; }
  .template-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-item[data-value="2.0"]::before { content: '2.0'; }
  .template-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-item[data-value="2.5"]::before { content: '2.5'; }
  .template-editor .ql-toolbar .ql-picker.ql-line-spacing .ql-picker-item[data-value="3.0"]::before { content: '3.0'; }
  .template-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-label::before {
    content: 'Paragraph Spacing';
  }
  .template-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-item[data-value="0"]::before { content: '0'; }
  .template-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-item[data-value="0.5em"]::before { content: '0.5em'; }
  .template-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-item[data-value="1em"]::before { content: '1em'; }
  .template-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-item[data-value="1.5em"]::before { content: '1.5em'; }
  .template-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-item[data-value="2em"]::before { content: '2em'; }
  .template-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-item[data-value="2.5em"]::before { content: '2.5em'; }
  .template-editor .ql-toolbar .ql-picker.ql-paragraph-spacing .ql-picker-item[data-value="3em"]::before { content: '3em'; }
  .template-editor .ql-toolbar .ql-picker.ql-font {
    max-width: 160px;
  }
  .template-editor .ql-toolbar .ql-picker.ql-font .ql-picker-label,
  .template-editor .ql-toolbar .ql-picker.ql-font .ql-picker-label::before,
  .template-editor .ql-toolbar .ql-picker.ql-font .ql-picker-label::after {
    white-space: nowrap;
  }
  .template-editor .ql-toolbar .ql-picker.ql-font .ql-picker-label {
    overflow: hidden;
    text-overflow: ellipsis;
    display: inline-block;
    max-width: 160px;
    vertical-align: middle;
  }
  .template-editor .ql-toolbar .ql-picker.ql-font .ql-picker-options {
    min-width: 180px;
    max-height: 300px;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .template-editor .ql-toolbar .ql-picker.ql-font .ql-picker-item,
  .template-editor .ql-toolbar .ql-picker.ql-font .ql-picker-item::before,
  .template-editor .ql-toolbar .ql-picker.ql-font .ql-picker-item::after {
    white-space: nowrap;
  }
  /* Font family assignments */
  .ql-font-arial,
  *[class*="ql-font-arial"] {
    font-family: Arial, sans-serif !important;
  }
  .ql-font-timesnewroman,
  *[class*="ql-font-timesnewroman"] {
    font-family: 'Times New Roman', Times, serif !important;
  }
  .ql-font-helvetica,
  *[class*="ql-font-helvetica"] {
    font-family: Helvetica, Arial, sans-serif !important;
  }
  .ql-font-georgia,
  *[class*="ql-font-georgia"] {
    font-family: Georgia, serif !important;
  }
  .ql-font-verdana,
  *[class*="ql-font-verdana"] {
    font-family: Verdana, Geneva, sans-serif !important;
  }
  .ql-font-trebuchetms,
  *[class*="ql-font-trebuchetms"] {
    font-family: 'Trebuchet MS', Helvetica, sans-serif !important;
  }
  .ql-font-tahoma,
  *[class*="ql-font-tahoma"] {
    font-family: Tahoma, Geneva, sans-serif !important;
  }
  .ql-font-couriernew,
  *[class*="ql-font-couriernew"] {
    font-family: 'Courier New', Courier, monospace !important;
  }
  .ql-font-lucidasansunicode,
  *[class*="ql-font-lucidasansunicode"] {
    font-family: 'Lucida Sans Unicode', 'Lucida Grande', sans-serif !important;
  }
  .ql-font-palatinolinotype,
  *[class*="ql-font-palatinolinotype"] {
    font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, serif !important;
  }
  .ql-font-cambria,
  *[class*="ql-font-cambria"] {
    font-family: Cambria, serif !important;
  }
  .ql-font-calistomt,
  *[class*="ql-font-calistomt"] {
    font-family: 'Calisto MT', serif !important;
  }
  .template-editor .ql-picker.ql-font .ql-picker-label[data-value="arial"]::before,
  .template-editor .ql-picker.ql-font .ql-picker-item[data-value="arial"]::before { content: 'Arial' !important; }
  .template-editor .ql-picker.ql-font .ql-picker-label[data-value="timesnewroman"]::before,
  .template-editor .ql-picker.ql-font .ql-picker-item[data-value="timesnewroman"]::before { content: 'Times New Roman' !important; }
  .template-editor .ql-picker.ql-font .ql-picker-label[data-value="helvetica"]::before,
  .template-editor .ql-picker.ql-font .ql-picker-item[data-value="helvetica"]::before { content: 'Helvetica' !important; }
  .template-editor .ql-picker.ql-font .ql-picker-label[data-value="georgia"]::before,
  .template-editor .ql-picker.ql-font .ql-picker-item[data-value="georgia"]::before { content: 'Georgia' !important; }
  .template-editor .ql-picker.ql-font .ql-picker-label[data-value="verdana"]::before,
  .template-editor .ql-picker.ql-font .ql-picker-item[data-value="verdana"]::before { content: 'Verdana' !important; }
  .template-editor .ql-picker.ql-font .ql-picker-label[data-value="trebuchetms"]::before,
  .template-editor .ql-picker.ql-font .ql-picker-item[data-value="trebuchetms"]::before { content: 'Trebuchet MS' !important; }
  .template-editor .ql-picker.ql-font .ql-picker-label[data-value="tahoma"]::before,
  .template-editor .ql-picker.ql-font .ql-picker-item[data-value="tahoma"]::before { content: 'Tahoma' !important; }
  .template-editor .ql-picker.ql-font .ql-picker-label[data-value="couriernew"]::before,
  .template-editor .ql-picker.ql-font .ql-picker-item[data-value="couriernew"]::before { content: 'Courier New' !important; }
  .template-editor .ql-picker.ql-font .ql-picker-label[data-value="lucidasansunicode"]::before,
  .template-editor .ql-picker.ql-font .ql-picker-item[data-value="lucidasansunicode"]::before { content: 'Lucida Sans Unicode' !important; }
  .template-editor .ql-picker.ql-font .ql-picker-label[data-value="palatinolinotype"]::before,
  .template-editor .ql-picker.ql-font .ql-picker-item[data-value="palatinolinotype"]::before { content: 'Palatino Linotype' !important; }
  .template-editor .ql-picker.ql-font .ql-picker-label[data-value="cambria"]::before,
  .template-editor .ql-picker.ql-font .ql-picker-item[data-value="cambria"]::before { content: 'Cambria' !important; }
  .template-editor .ql-picker.ql-font .ql-picker-label[data-value="calistomt"]::before,
  .template-editor .ql-picker.ql-font .ql-picker-item[data-value="calistomt"]::before { content: 'Calisto MT' !important; }
  .template-editor .ql-picker.ql-font .ql-picker-label:not([data-value])::before {
    content: 'Sans Serif' !important;
  }
  /* Font Size Styles - Numeric sizes like MS Word */
  /* Apply to all possible elements that Quill might use */
  .template-editor .ql-editor .ql-size-8,
  .template-editor .ql-editor span.ql-size-8,
  .template-editor .ql-editor p.ql-size-8,
  .template-editor .ql-editor div.ql-size-8,
  .template-editor .ql-editor strong.ql-size-8,
  .template-editor .ql-editor em.ql-size-8,
  .template-editor .ql-editor u.ql-size-8,
  .template-editor .ql-editor *[class*="ql-size-8"] {
    font-size: 8px !important;
  }
  .template-editor .ql-editor .ql-size-9,
  .template-editor .ql-editor span.ql-size-9,
  .template-editor .ql-editor p.ql-size-9,
  .template-editor .ql-editor div.ql-size-9,
  .template-editor .ql-editor strong.ql-size-9,
  .template-editor .ql-editor em.ql-size-9,
  .template-editor .ql-editor u.ql-size-9,
  .template-editor .ql-editor *[class*="ql-size-9"] {
    font-size: 9px !important;
  }
  .template-editor .ql-editor .ql-size-10,
  .template-editor .ql-editor span.ql-size-10,
  .template-editor .ql-editor p.ql-size-10,
  .template-editor .ql-editor div.ql-size-10,
  .template-editor .ql-editor strong.ql-size-10,
  .template-editor .ql-editor em.ql-size-10,
  .template-editor .ql-editor u.ql-size-10,
  .template-editor .ql-editor *[class*="ql-size-10"] {
    font-size: 10px !important;
  }
  .template-editor .ql-editor .ql-size-11,
  .template-editor .ql-editor span.ql-size-11,
  .template-editor .ql-editor p.ql-size-11,
  .template-editor .ql-editor div.ql-size-11,
  .template-editor .ql-editor strong.ql-size-11,
  .template-editor .ql-editor em.ql-size-11,
  .template-editor .ql-editor u.ql-size-11,
  .template-editor .ql-editor *[class*="ql-size-11"] {
    font-size: 11px !important;
  }
  .template-editor .ql-editor .ql-size-12,
  .template-editor .ql-editor span.ql-size-12,
  .template-editor .ql-editor p.ql-size-12,
  .template-editor .ql-editor div.ql-size-12,
  .template-editor .ql-editor strong.ql-size-12,
  .template-editor .ql-editor em.ql-size-12,
  .template-editor .ql-editor u.ql-size-12,
  .template-editor .ql-editor *[class*="ql-size-12"] {
    font-size: 12px !important;
  }
  .template-editor .ql-editor .ql-size-14,
  .template-editor .ql-editor span.ql-size-14,
  .template-editor .ql-editor p.ql-size-14,
  .template-editor .ql-editor div.ql-size-14,
  .template-editor .ql-editor strong.ql-size-14,
  .template-editor .ql-editor em.ql-size-14,
  .template-editor .ql-editor u.ql-size-14,
  .template-editor .ql-editor *[class*="ql-size-14"] {
    font-size: 14px !important;
  }
  .template-editor .ql-editor .ql-size-16,
  .template-editor .ql-editor span.ql-size-16,
  .template-editor .ql-editor p.ql-size-16,
  .template-editor .ql-editor div.ql-size-16,
  .template-editor .ql-editor strong.ql-size-16,
  .template-editor .ql-editor em.ql-size-16,
  .template-editor .ql-editor u.ql-size-16,
  .template-editor .ql-editor *[class*="ql-size-16"] {
    font-size: 16px !important;
  }
  .template-editor .ql-editor .ql-size-18,
  .template-editor .ql-editor span.ql-size-18,
  .template-editor .ql-editor p.ql-size-18,
  .template-editor .ql-editor div.ql-size-18,
  .template-editor .ql-editor strong.ql-size-18,
  .template-editor .ql-editor em.ql-size-18,
  .template-editor .ql-editor u.ql-size-18,
  .template-editor .ql-editor *[class*="ql-size-18"] {
    font-size: 18px !important;
  }
  .template-editor .ql-editor .ql-size-20,
  .template-editor .ql-editor span.ql-size-20,
  .template-editor .ql-editor p.ql-size-20,
  .template-editor .ql-editor div.ql-size-20,
  .template-editor .ql-editor strong.ql-size-20,
  .template-editor .ql-editor em.ql-size-20,
  .template-editor .ql-editor u.ql-size-20,
  .template-editor .ql-editor *[class*="ql-size-20"] {
    font-size: 20px !important;
  }
  .template-editor .ql-editor .ql-size-22,
  .template-editor .ql-editor span.ql-size-22,
  .template-editor .ql-editor p.ql-size-22,
  .template-editor .ql-editor div.ql-size-22,
  .template-editor .ql-editor strong.ql-size-22,
  .template-editor .ql-editor em.ql-size-22,
  .template-editor .ql-editor u.ql-size-22,
  .template-editor .ql-editor *[class*="ql-size-22"] {
    font-size: 22px !important;
  }
  .template-editor .ql-editor .ql-size-24,
  .template-editor .ql-editor span.ql-size-24,
  .template-editor .ql-editor p.ql-size-24,
  .template-editor .ql-editor div.ql-size-24,
  .template-editor .ql-editor strong.ql-size-24,
  .template-editor .ql-editor em.ql-size-24,
  .template-editor .ql-editor u.ql-size-24,
  .template-editor .ql-editor *[class*="ql-size-24"] {
    font-size: 24px !important;
  }
  /* Font Size Picker - Show numeric values (SizeStyle uses pixel values like "8px") */
  .template-editor .ql-picker.ql-size .ql-picker-label[data-value="8px"]::before,
  .template-editor .ql-picker.ql-size .ql-picker-item[data-value="8px"]::before {
    content: '8' !important;
  }
  .template-editor .ql-picker.ql-size .ql-picker-label[data-value="9px"]::before,
  .template-editor .ql-picker.ql-size .ql-picker-item[data-value="9px"]::before {
    content: '9' !important;
  }
  .template-editor .ql-picker.ql-size .ql-picker-label[data-value="10px"]::before,
  .template-editor .ql-picker.ql-size .ql-picker-item[data-value="10px"]::before {
    content: '10' !important;
  }
  .template-editor .ql-picker.ql-size .ql-picker-label[data-value="11px"]::before,
  .template-editor .ql-picker.ql-size .ql-picker-item[data-value="11px"]::before {
    content: '11' !important;
  }
  .template-editor .ql-picker.ql-size .ql-picker-label[data-value="12px"]::before,
  .template-editor .ql-picker.ql-size .ql-picker-item[data-value="12px"]::before {
    content: '12' !important;
  }
  .template-editor .ql-picker.ql-size .ql-picker-label[data-value="14px"]::before,
  .template-editor .ql-picker.ql-size .ql-picker-item[data-value="14px"]::before {
    content: '14' !important;
  }
  .template-editor .ql-picker.ql-size .ql-picker-label[data-value="16px"]::before,
  .template-editor .ql-picker.ql-size .ql-picker-item[data-value="16px"]::before {
    content: '16' !important;
  }
  .template-editor .ql-picker.ql-size .ql-picker-label[data-value="18px"]::before,
  .template-editor .ql-picker.ql-size .ql-picker-item[data-value="18px"]::before {
    content: '18' !important;
  }
  .template-editor .ql-picker.ql-size .ql-picker-label[data-value="20px"]::before,
  .template-editor .ql-picker.ql-size .ql-picker-item[data-value="20px"]::before {
    content: '20' !important;
  }
  .template-editor .ql-picker.ql-size .ql-picker-label[data-value="22px"]::before,
  .template-editor .ql-picker.ql-size .ql-picker-item[data-value="22px"]::before {
    content: '22' !important;
  }
  .template-editor .ql-picker.ql-size .ql-picker-label[data-value="24px"]::before,
  .template-editor .ql-picker.ql-size .ql-picker-item[data-value="24px"]::before {
    content: '24' !important;
  }
  /* Hide default text in size picker */
  .template-editor .ql-picker.ql-size .ql-picker-label[data-value] span,
  .template-editor .ql-picker.ql-size .ql-picker-item[data-value] span {
    display: none !important;
  }
  .template-editor .ql-picker.ql-size .ql-picker-label[data-value]::after {
    display: none !important;
  }
  /* Show default "Normal" when no size is selected */
  .template-editor .ql-picker.ql-size .ql-picker-label:not([data-value])::before {
    content: 'Normal' !important;
  }
  .template-editor .ql-picker.ql-size .ql-picker-options {
    max-height: 300px;
    overflow-y: auto;
    overflow-x: hidden;
  }
`;

const stripHtml = (html) => {
  if (!html) return '';
  if (typeof window === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').trim();
  }
  const div = window.document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').trim();
};

const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const { result } = reader;
      if (typeof result === 'string') {
        const base64 = result.includes(',')
          ? result.split(',')[1]
          : result;
        resolve(base64);
      } else {
        reject(new Error('Unable to read file'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });

const getInitialTemplateForm = () => ({
  name: '',
  stage: '',
  subject: '',
  bodyHtml: '',
  bodyText: '',
  description: '',
  variables: [],
  sendAfterDays: 1,
  followUpNumber: 1
});

const Templates = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEditMode = location.pathname.includes('/edit');
  const isNewMode = location.pathname.includes('/new');
  const isEditorMode = isEditMode || isNewMode;
  
  const [activeTab, setActiveTab] = useState('templates');
  const [draftIdBeingDeleted, setDraftIdBeingDeleted] = useState(null);
  const queryClient = useQueryClient();
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [showFilters, setShowFilters] = useState(false);

  // Dynamic variables available for templates
  const availableVariables = [
    // Client variables
    { key: 'name', label: 'Client Name', icon: User, description: 'Full name of the client (John Doe)' },
    { key: 'email', label: 'Client Email', icon: Mail, description: 'Email address of the client' },
    { key: 'country', label: 'Client Country', icon: Globe, description: 'Country of the client' },
    // Conference variables
    { key: 'conferenceName', label: 'Conference Name', icon: Building, description: 'Name of the conference' },
    { key: 'conferenceShortName', label: 'Conference Short Name', icon: Building, description: 'Short / abbreviated name of the conference' },
    { key: 'conferenceVenue', label: 'Conference Venue', icon: MapPin, description: 'Venue of the conference' },
    { key: 'conferenceDate', label: 'Conference Date Range', icon: Calendar, description: 'Full date range (June 15 to 17, 2024)' },
    { key: 'conferenceStartDate', label: 'Start Date', icon: Calendar, description: 'Conference start date only' },
    { key: 'conferenceEndDate', label: 'End Date', icon: Calendar, description: 'Conference end date only' },
    { key: 'abstractDeadline', label: 'Abstract Deadline', icon: Calendar, description: 'Deadline for abstract submission' },
    { key: 'registrationDeadline', label: 'Registration Deadline', icon: Calendar, description: 'Deadline for registration' },
    { key: 'conferenceWebsite', label: 'Conference Website', icon: Globe, description: 'Conference website URL' },
    { key: 'conferenceAbstractSubmissionLink', label: 'Abstract Submission Link', icon: Globe, description: 'Link for abstract submissions' },
    { key: 'conferenceRegistrationLink', label: 'Registration Link', icon: Globe, description: 'Registration portal link' },
    { key: 'conferenceDescription', label: 'Conference Description', icon: Building, description: 'Conference description' },
    // System variables
    { key: 'currentDate', label: 'Current Date', icon: Calendar, description: 'Today\'s date' },
    { key: 'currentYear', label: 'Current Year', icon: Calendar, description: 'Current year (2025)' }
  ];

  const { data: templateDrafts = [], isLoading: draftsLoading } = useQuery('template-drafts', async () => {
    const response = await axios.get('/api/template-drafts');
    return response.data;
  });

  const createTemplateDraftMutation = useMutation(async (draftData) => {
    const response = await axios.post('/api/template-drafts', draftData);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('template-drafts');
      setActiveTab('drafts');
      toast.success('Draft saved');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to save draft');
    }
  });

  const updateTemplateDraftMutation = useMutation(async ({ id, data }) => {
    const response = await axios.put(`/api/template-drafts/${id}`, data);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('template-drafts');
      setActiveTab('drafts');
      toast.success('Draft updated');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update draft');
    }
  });

  const deleteTemplateDraftMutation = useMutation(
    async ({ id }) => {
      await axios.delete(`/api/template-drafts/${id}`);
      return id;
    },
    {
      onMutate: (variables) => {
        setDraftIdBeingDeleted(variables.id);
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries('template-drafts');
        if (!variables?.silent) {
          toast.success('Draft deleted');
        }
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete draft');
      },
      onSettled: () => {
        setDraftIdBeingDeleted(null);
      }
    }
  );

  const isDeletingDraft = deleteTemplateDraftMutation.isLoading;

  const { data: templates, isLoading } = useQuery('templates', async () => {
    const response = await axios.get('/api/templates');
    return response.data;
  });

  // Fetch single template when in edit mode
  const { data: editTemplate, isLoading: isLoadingEditTemplate } = useQuery(
    ['template', id],
    async () => {
      const response = await axios.get(`/api/templates/${id}`);
      return response.data;
    },
    {
      enabled: isEditMode && !!id,
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to load template');
        navigate('/templates');
      }
    }
  );

  const addTemplateMutation = useMutation(async (templateData) => {
    const response = await axios.post('/api/templates', templateData);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('templates');
      navigate('/templates');
      toast.success('Template created successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to create template');
    }
  });

  const updateTemplateMutation = useMutation(async ({ id, data }) => {
    const response = await axios.put(`/api/templates/${id}`, data);
    return response.data;
  }, {
    onSuccess: async () => {
      await queryClient.invalidateQueries('templates');
      navigate('/templates');
      toast.success('Template updated successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update template');
    }
  });

  const deleteTemplateMutation = useMutation(async (id) => {
    const response = await axios.delete(`/api/templates/${id}`);
    return response.data;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries('templates');
      toast.success('Template deleted successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete template');
    }
  });

  const getStageBadge = (stage) => {
    const stageClasses = {
      'abstract_submission': 'bg-blue-100 text-blue-800',
      'registration': 'bg-green-100 text-green-800'
    };
    return `status-badge ${stageClasses[stage] || 'bg-gray-100 text-gray-800'}`;
  };

  const getStageName = (stage) => {
    const stageNames = {
      'abstract_submission': 'Abstract Submission',
      'registration': 'Registration'
    };
    return stageNames[stage] || stage;
  };

  const handleEdit = (template) => {
    if (!template) return;
    navigate(`/templates/${template.id}/edit`);
  };

  const handleDelete = (template) => {
    if (window.confirm(`Are you sure you want to delete "${template.name}"? This action cannot be undone.`)) {
      deleteTemplateMutation.mutate(template.id);
    }
  };

  const handleEditDraft = (draft) => {
    if (!draft) return;
    navigate('/templates/new');
  };

  const handleDeleteDraft = (id) => {
    if (!id) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Delete this template draft permanently?');
      if (!confirmed) return;
    }
    deleteTemplateDraftMutation.mutate({ id });
  };

  // Filter templates based on search and stage filter
  const filteredTemplates = React.useMemo(() => {
    if (!templates || !Array.isArray(templates)) return [];
    
    let filtered = [...templates];
    
    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(template => 
        template.name?.toLowerCase().includes(searchLower) ||
        template.subject?.toLowerCase().includes(searchLower) ||
        template.bodyText?.toLowerCase().includes(searchLower) ||
        template.bodyHtml?.toLowerCase().includes(searchLower)
      );
    }
    
    // Apply stage filter
    if (stageFilter !== 'all') {
      filtered = filtered.filter(template => template.stage === stageFilter);
    }
    
    return filtered;
  }, [templates, searchTerm, stageFilter]);

  // Filter drafts based on search
  const filteredDrafts = React.useMemo(() => {
    if (!templateDrafts || !Array.isArray(templateDrafts)) return [];
    
    if (!searchTerm.trim()) return templateDrafts;
    
    const searchLower = searchTerm.toLowerCase().trim();
    return templateDrafts.filter(draft => 
      draft.name?.toLowerCase().includes(searchLower) ||
      draft.subject?.toLowerCase().includes(searchLower) ||
      draft.bodyText?.toLowerCase().includes(searchLower) ||
      draft.bodyHtml?.toLowerCase().includes(searchLower)
    );
  }, [templateDrafts, searchTerm]);



  // If in editor mode, render full-page editor
  if (isEditorMode) {
    const currentTemplate = isEditMode ? editTemplate : null;
    const isLoadingTemplate = isEditMode && isLoadingEditTemplate;

    if (isLoadingTemplate) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gray-50">
        <style>{TEMPLATE_EDITOR_STYLES}</style>
        {/* Navigation Header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => navigate('/templates')}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Back to templates"
                >
                  <ArrowLeft className="h-5 w-5 text-gray-600" />
                </button>
                <div>
                  <nav className="flex items-center space-x-2 text-sm text-gray-500 mb-1">
                    <button
                      onClick={() => navigate('/templates')}
                      className="hover:text-gray-900"
                    >
                      Templates
                    </button>
                    <ChevronRight className="h-4 w-4" />
                    <span className="text-gray-900 font-medium">
                      {isNewMode ? 'Create New Template' : 'Edit Template'}
                    </span>
                  </nav>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {isNewMode ? 'Create New Template' : currentTemplate?.name || 'Edit Template'}
                  </h1>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Editor Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <TemplateForm
            template={currentTemplate}
            onSubmit={(data) => {
              if (isNewMode) {
                addTemplateMutation.mutate(data);
              } else if (isEditMode && id) {
                updateTemplateMutation.mutate({ id, data });
              }
            }}
            onCancel={() => navigate('/templates')}
            loading={addTemplateMutation.isLoading || updateTemplateMutation.isLoading}
          />
        </div>
      </div>
    );
  }

  // Otherwise, render list view
  return (
    <div className="space-y-6">
      <style>{TEMPLATE_EDITOR_STYLES}</style>
      {/* Enhanced Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-sm border border-blue-100 p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Email Templates</h1>
            <p className="text-gray-600 text-lg">Create and manage dynamic email templates with attachments</p>
            <div className="mt-4 flex items-center space-x-4 text-sm text-gray-500">
              <div className="flex items-center">
                <Code className="h-4 w-4 mr-1" />
                Dynamic Variables
              </div>
              <div className="flex items-center">
                <Paperclip className="h-4 w-4 mr-1" />
                File Attachments
              </div>
              <div className="flex items-center">
                <Mail className="h-4 w-4 mr-1" />
                Multi-Stage Templates
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              navigate('/templates/new');
            }}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 font-medium shadow-sm flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Create Template
          </button>
        </div>
      </div>

      {/* Search, Filter, and View Controls */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          {/* Tabs */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setActiveTab('templates')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'templates'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Templates
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('drafts')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'drafts'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Drafts
            </button>
          </div>

          {/* Search and View Controls */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Search Bar */}
            <div className="relative flex-1 sm:flex-initial sm:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter Button (only for templates tab) */}
            {activeTab === 'templates' && (
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 border rounded-lg flex items-center gap-2 transition-colors ${
                  showFilters || stageFilter !== 'all'
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Filter className="h-4 w-4" />
                <span className="text-sm font-medium">Filter</span>
                {stageFilter !== 'all' && (
                  <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                    1
                  </span>
                )}
              </button>
            )}

            {/* View Toggle */}
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title="Grid View"
              >
                <Grid3x3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title="List View"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && activeTab === 'templates' && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Filter Templates</h3>
              <button
                onClick={() => {
                  setStageFilter('all');
                  setShowFilters(false);
                }}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Clear all
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stage</label>
                <div className="flex flex-wrap gap-2">
                  {['all', 'abstract_submission', 'registration'].map((stage) => (
                    <button
                      key={stage}
                      onClick={() => setStageFilter(stage)}
                      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                        stageFilter === stage
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {stage === 'all' ? 'All Stages' : getStageName(stage)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results Count */}
        <div className="text-sm text-gray-600">
          {activeTab === 'templates' ? (
            <>
              Showing {filteredTemplates.length} of {templates?.length || 0} template{filteredTemplates.length !== 1 ? 's' : ''}
              {(searchTerm || stageFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setStageFilter('all');
                    setShowFilters(false);
                  }}
                  className="ml-2 text-blue-600 hover:text-blue-700 underline"
                >
                  Clear filters
                </button>
              )}
            </>
          ) : (
            <>
              Showing {filteredDrafts.length} of {templateDrafts.length} draft{filteredDrafts.length !== 1 ? 's' : ''}
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="ml-2 text-blue-600 hover:text-blue-700 underline"
                >
                  Clear search
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Templates / Drafts Display */}
      {activeTab === 'templates' ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              <div className="col-span-full flex justify-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="col-span-full text-center py-8">
                <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">
                  {templates?.length === 0 
                    ? 'No templates created yet' 
                    : 'No templates match your search or filters'}
                </p>
              </div>
            ) : (
              filteredTemplates.map((template) => (
              <div key={template.id} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-lg transition-all duration-200 p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{template.name}</h3>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStageBadge(template.stage)}`}>
                      {getStageName(template.stage)}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-3 mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Subject:</p>
                    <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded border-l-2 border-blue-200">
                      {template.subject}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Preview:</p>
                    <p className="text-sm text-gray-500 bg-gray-50 p-2 rounded line-clamp-3">
                      {template.bodyText?.substring(0, 120) || template.bodyHtml?.replace(/<[^>]*>/g, '').substring(0, 120)}...
                    </p>
                  </div>
                </div>
                
                <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <span>Version {template.version}</span>
                    {template.attachments && template.attachments.length > 0 && (
                      <span className="flex items-center">
                        <Paperclip className="h-3 w-3 mr-1" />
                        {template.attachments.length} files
                      </span>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(template)}
                      className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200"
                      title="Edit"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(template)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                      title="Delete"
                      disabled={deleteTemplateMutation.isLoading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              ))
            )}
          </div>
        ) : (
          /* List View */
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-8">
                <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">
                  {templates?.length === 0 
                    ? 'No templates created yet' 
                    : 'No templates match your search or filters'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredTemplates.map((template) => (
                  <div key={template.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStageBadge(template.stage)}`}>
                            {getStageName(template.stage)}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <span className="text-sm font-medium text-gray-700">Subject: </span>
                            <span className="text-sm text-gray-600">{template.subject}</span>
                          </div>
                          <p className="text-sm text-gray-500 line-clamp-2">
                            {template.bodyText?.substring(0, 200) || template.bodyHtml?.replace(/<[^>]*>/g, '').substring(0, 200)}...
                          </p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>Version {template.version}</span>
                            {template.attachments && template.attachments.length > 0 && (
                              <span className="flex items-center">
                                <Paperclip className="h-3 w-3 mr-1" />
                                {template.attachments.length} files
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleEdit(template)}
                          className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(template)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                          title="Delete"
                          disabled={deleteTemplateMutation.isLoading}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {draftsLoading ? (
            <div className="col-span-full flex justify-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          ) : filteredDrafts.length === 0 ? (
            <div className="col-span-full text-center py-8">
              <File className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">
                {templateDrafts.length === 0 
                  ? 'No drafts saved yet' 
                  : 'No drafts match your search'}
              </p>
              {templateDrafts.length === 0 && (
                <p className="text-sm text-gray-400 mt-1">Use "Save Draft" in the composer to keep work-in-progress templates.</p>
              )}
            </div>
          ) : (
            filteredDrafts.map((draft) => (
              <div key={draft.id} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-lg transition-all duration-200 p-6">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{draft.name || 'Untitled Draft'}</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{draft.stage ? getStageName(draft.stage) : 'Stage not set'}</span>
                      <span>•</span>
                      <span>Updated {draft.updatedAt ? new Date(draft.updatedAt).toLocaleString() : 'recently'}</span>
                    </div>
                  </div>
                  <span className="text-xs uppercase tracking-wide text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                    Draft
                  </span>
                </div>
                <div className="space-y-3 mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Subject:</p>
                    <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded border-l-2 border-blue-200">
                      {draft.subject || '(no subject)'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Preview:</p>
                    <p className="text-sm text-gray-500 bg-gray-50 p-2 rounded line-clamp-3">
                      {draft.bodyText?.substring(0, 120) || draft.bodyHtml?.replace(/<[^>]*>/g, '').substring(0, 120) || 'No content yet'}
                    </p>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {draft.attachments?.length ? (
                      <span className="flex items-center">
                        <Paperclip className="h-3 w-3 mr-1" />
                        {draft.attachments.length} files
                      </span>
                    ) : (
                      <span>No attachments</span>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEditDraft(draft)}
                      className="px-3 py-1.5 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      Edit Draft
                    </button>
                    <button
                      onClick={() => handleDeleteDraft(draft.id)}
                      className="px-3 py-1.5 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                      disabled={isDeletingDraft && draftIdBeingDeleted === draft.id}
                    >
                      {isDeletingDraft && draftIdBeingDeleted === draft.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}


    </div>
  );
};

const estimateSizeFromBase64 = (content) => {
  if (!content || typeof content !== 'string') return 0;
  const padding = (content.match(/=*$/) || [''])[0].length;
  return Math.ceil(content.length / 4) * 3 - padding;
};

const normalizeExistingAttachments = (template) => {
  if (!template?.attachments || !Array.isArray(template.attachments)) {
    return [];
  }

  return template.attachments.map((att, idx) => {
    const content = typeof att.content === 'string' ? att.content : '';
    return {
      ...att,
      id: att.id || `${template.id || 'template'}-attachment-${idx}`,
      name: att.name || att.filename || `Attachment ${idx + 1}`,
      filename: att.filename || att.name || `attachment-${idx + 1}`,
      content,
      type: att.type || att.contentType || 'application/octet-stream',
      contentType: att.contentType || att.type || 'application/octet-stream',
      encoding: att.encoding || (content ? 'base64' : undefined),
      size: typeof att.size === 'number' ? att.size : estimateSizeFromBase64(content)
    };
  });
};

const formatBytes = (bytes) => {
  if (!bytes || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const TemplateForm = ({ template, onSubmit, onCancel, loading }) => {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const isInitializedRef = useRef(false);

  // Initialize formData with template data immediately - use function to ensure fresh data
  const getInitialFormData = (templateData) => {
    if (templateData) {
      return {
        name: templateData.name || '',
        stage: templateData.stage || '',
        subject: templateData.subject || '',
        bodyHtml: templateData.bodyHtml || '',
        bodyText: templateData.bodyText || stripHtml(templateData.bodyHtml || ''),
        followUpNumber: templateData.followUpNumber || 1
      };
    }
    return {
      name: '',
      stage: '',
      subject: '',
      bodyHtml: '',
      bodyText: '',
      followUpNumber: 1
    };
  };

  const [formData, setFormData] = useState(() => getInitialFormData(template));
  const [attachments, setAttachments] = useState(() => normalizeExistingAttachments(template));

  useEffect(() => {
    if (template) {
      const templateBodyHtml = template.bodyHtml || '';
      
      const newFormData = {
        name: template.name || '',
        stage: template.stage || '',
        subject: template.subject || '',
        bodyHtml: templateBodyHtml,
        bodyText: template.bodyText || stripHtml(templateBodyHtml),
        followUpNumber: template.followUpNumber || 1
      };
      setFormData(newFormData);
      setAttachments(normalizeExistingAttachments(template));
      
      // Force ReactQuill to load the HTML content with all spacing preserved
      // Use a small delay to ensure the editor is fully mounted and initialized
      const timer = setTimeout(() => {
        if (editorRef.current && templateBodyHtml) {
          const quill = editorRef.current.getEditor();
          if (quill) {
            // Get current content to check if it needs updating
            const currentContent = quill.root.innerHTML.trim();
            const newContent = templateBodyHtml.trim();
            
            // Only update if content is different
            if (currentContent !== newContent) {
              // Use dangerouslyPasteHTML to preserve all HTML formatting and spacing
              // This method preserves the original HTML structure better than the value prop
              try {
                // Clear existing content first
                quill.setText('');
                // Paste the HTML at the beginning, preserving all formatting
                quill.clipboard.dangerouslyPasteHTML(0, templateBodyHtml);
              } catch (error) {
                console.error('Error pasting HTML into Quill:', error);
                // Fallback: set HTML directly
                quill.root.innerHTML = templateBodyHtml;
              }
            }
          }
        }
      }, 200);
      
      return () => clearTimeout(timer);
    } else {
      // Reset form when template is null
      setFormData({
        name: '',
        stage: '',
        subject: '',
        bodyHtml: '',
        bodyText: ''
      });
      setAttachments([]);
    }
  }, [template]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const bodyTextValue = stripHtml(formData.bodyHtml);
    if (!bodyTextValue) {
      toast.error('Email body is required');
      return;
    }

    const attachmentPayload = attachments.map(att => ({
      id: att.id,
      name: att.name,
      filename: att.filename || att.name,
      size: att.size,
      type: att.type,
      contentType: att.contentType || att.type,
      encoding: att.encoding || (att.content ? 'base64' : undefined),
      content: att.content || null
    }));

    onSubmit({
      ...formData,
      stage: formData.stage,
      followUpNumber: formData.followUpNumber || 1,
      bodyText: bodyTextValue,
      attachments: attachmentPayload
    });
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleBodyChange = (value) => {
    // Ensure line breaks are properly preserved
    // Quill automatically converts Enter key to <p> or <br> tags
    // We ensure the value is always a string to prevent issues
    const htmlValue = value || '';
    setFormData({
      ...formData,
      bodyHtml: htmlValue,
      bodyText: stripHtml(htmlValue)
    });
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
      const processed = await Promise.all(
        files.map(async (file) => {
          const base64Content = await readFileAsBase64(file);
          return {
            id: `${Date.now()}-${Math.random()}`,
            name: file.name,
            filename: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            contentType: file.type || 'application/octet-stream',
            encoding: 'base64',
            content: base64Content
          };
        })
      );

      setAttachments((prev) => [...prev, ...processed]);
    } catch (error) {
      console.error('Error reading attachment:', error);
      toast.error('Failed to read one or more attachments');
    } finally {
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const removeAttachment = (id) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  const handleDownloadAttachment = (attachment) => {
    if (typeof window === 'undefined') {
      toast.error('Download is only available in the browser');
      return;
    }

    if (!attachment?.content) {
      toast.error('Attachment content is unavailable');
      return;
    }

    try {
      const byteCharacters = window.atob(attachment.content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i += 1) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachment.contentType || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename || attachment.name || 'attachment';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download attachment:', error);
      toast.error('Unable to download attachment');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Template Name
          </label>
          <input
            type="text"
            name="name"
            required
            value={formData.name}
            onChange={handleChange}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Stage
          </label>
          <select
            name="stage"
            required
            value={formData.stage}
            onChange={handleChange}
            className="input-field"
          >
            <option value="">Select Stage</option>
            <option value="abstract_submission">Abstract Submission</option>
            <option value="registration">Registration</option>
          </select>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Subject
        </label>
        <input
          type="text"
          name="subject"
          required
          value={formData.subject}
          onChange={handleChange}
          className="input-field"
          placeholder="Use {Name}, {ConferenceName} for variables"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email Body (HTML) *
        </label>
        <div className="border border-gray-300 rounded-lg bg-white overflow-hidden">
          <ReactQuill
            key={`template-form-editor-${template?.id || 'new'}`}
            ref={editorRef}
            value={formData.bodyHtml || ''}
            onChange={handleBodyChange}
            modules={quillModules}
            formats={quillFormats}
            placeholder="Use {Name}, {ConferenceName}, {Email}, {Country} for variables"
            className="template-editor"
            theme="snow"
            bounds="self"
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Available variables: {'{Name}'}, {'{ConferenceName}'}, {'{Email}'}, {'{Country}'}
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-4">File Attachments</h4>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors duration-200">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            id="edit-file-upload"
          />
          <label htmlFor="edit-file-upload" className="cursor-pointer">
            <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Click to upload files or drag and drop</p>
            <p className="text-xs text-gray-500">PDF, DOC, DOCX, PNG, JPG up to 10MB each</p>
          </label>
        </div>

        {attachments.length > 0 && (
          <div className="space-y-2 mt-4">
            <h5 className="text-sm font-medium text-gray-700">Attached Files:</h5>
            {attachments.map((attachment) => (
              <div key={attachment.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                <div className="flex items-center">
                  <Paperclip className="h-4 w-4 text-gray-400 mr-2" />
                  <div>
                    <p className="text-sm text-gray-700">{attachment.filename || attachment.name}</p>
                    <p className="text-xs text-gray-500">{formatBytes(attachment.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadAttachment(attachment)}
                    className="p-1.5 text-blue-500 hover:text-blue-700 rounded-full hover:bg-blue-50"
                    title="Download attachment"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    className="p-1.5 text-red-500 hover:text-red-700 rounded-full hover:bg-red-50"
                    title="Remove attachment"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary"
        >
          {loading ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
        </button>
      </div>
    </form>
  );
};

export default Templates;
