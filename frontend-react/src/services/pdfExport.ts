import jsPDF from 'jspdf';
import { Message } from '@/types';

interface ExportOptions {
  title?: string;
  includeTimestamps?: boolean;
}

interface TextSegment {
  text: string;
  bold: boolean;
}

export async function exportChatToPDF(
  messages: Message[],
  options: ExportOptions = {}
): Promise<void> {
  const { title = 'Insurance Chat Export', includeTimestamps = true } = options;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - 2 * margin;
  const footerHeight = 10;
  const firstPageTop = 52;
  const standardPageTop = 30;
  let yPosition = firstPageTop;
  const generatedAt = new Date();

  // Colors
  const colors = {
    primary: [25, 25, 25] as [number, number, number],
    secondary: [60, 60, 60] as [number, number, number],
    muted: [120, 120, 120] as [number, number, number],
    accent: [40, 40, 40] as [number, number, number],
    assistantBg: [255, 255, 255] as [number, number, number],
    userBg: [255, 255, 255] as [number, number, number],
    headerBg: [255, 255, 255] as [number, number, number],
    success: [70, 70, 70] as [number, number, number],
    tableHeader: [255, 255, 255] as [number, number, number],
    tableBorder: [210, 210, 210] as [number, number, number],
  };

  const truncateToWidth = (text: string, maxWidth: number): string => {
    if (pdf.getTextWidth(text) <= maxWidth) return text;
    let truncated = text;
    while (truncated.length > 3 && pdf.getTextWidth(`${truncated}...`) > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return `${truncated}...`;
  };

  const renderWrappedRichText = (
    text: string,
    startX: number,
    maxWidth: number,
    fontSize: number,
    lineHeight: number,
    paragraphSpacing: number
  ): void => {
    const segments = parseBoldText(text);
    let xPos = startX;
    const maxX = startX + maxWidth;

    for (const segment of segments) {
      pdf.setFont('helvetica', segment.bold ? 'bold' : 'normal');
      pdf.setFontSize(fontSize);

      const tokens = segment.text.split(/(\s+)/).filter(token => token.length > 0);
      for (const token of tokens) {
        const isWhitespace = token.trim().length === 0;
        if (isWhitespace && xPos === startX) {
          continue;
        }

        const tokenWidth = pdf.getTextWidth(token);
        if (!isWhitespace && xPos + tokenWidth > maxX && xPos > startX) {
          yPosition += lineHeight;
          checkPageBreak(lineHeight + 1);
          xPos = startX;
        }

        pdf.text(token, xPos, yPosition);
        xPos += tokenWidth;
      }
    }

    yPosition += paragraphSpacing;
  };

  const drawPageHeader = (compact = false): void => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...colors.primary);
    pdf.text('Insurance Placement AI', margin, 10);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...colors.muted);
    pdf.text('Conversation Export', margin, 15);

    const timestamp = generatedAt.toLocaleString();
    pdf.text(timestamp, pageWidth - margin - pdf.getTextWidth(timestamp), 15);

    pdf.setDrawColor(...colors.tableBorder);
    pdf.setLineWidth(0.3);
    pdf.line(margin, 19, pageWidth - margin, 19);

    if (!compact) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.setTextColor(...colors.primary);
      pdf.text(title, margin, 32);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...colors.secondary);
      pdf.text(`Messages: ${messages.filter(m => !m.isLoading).length}`, margin, 39);
      const dateText = `Generated: ${generatedAt.toLocaleDateString()} ${generatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      pdf.text(dateText, pageWidth - margin - pdf.getTextWidth(dateText), 39);

      pdf.setDrawColor(...colors.tableBorder);
      pdf.setLineWidth(0.35);
      pdf.line(margin, 44, pageWidth - margin, 44);
    }
  };

  drawPageHeader(false);

  // Check page break
  const checkPageBreak = (requiredSpace: number): boolean => {
    if (yPosition + requiredSpace > pageHeight - margin - footerHeight) {
      pdf.addPage();
      drawPageHeader(true);
      yPosition = standardPageTop;
      return true;
    }
    return false;
  };

  // Parse bold text segments
  const parseBoldText = (text: string): TextSegment[] => {
    const segments: TextSegment[] = [];
    const regex = /\*\*([^*]+)\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: text.slice(lastIndex, match.index), bold: false });
      }
      segments.push({ text: match[1], bold: true });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      segments.push({ text: text.slice(lastIndex), bold: false });
    }

    return segments.length > 0 ? segments : [{ text, bold: false }];
  };

  // Wrap text helper
  const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
    pdf.setFontSize(fontSize);
    const cleanText = text.replace(/\*\*/g, '');
    const words = cleanText.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = pdf.getTextWidth(testLine);

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines;
  };

  // Render a table
  const renderTable = (rows: string[][]): void => {
    if (rows.length === 0) return;

    const colCount = rows[0].length;
    const colWidth = contentWidth / colCount;
    const cellPadding = 2;
    const rowHeight = 7;

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      const isHeader = rowIdx === 0;

      checkPageBreak(rowHeight + 2);

      // Draw row background
      if (isHeader) {
        pdf.setFillColor(...colors.tableHeader);
      }

      // Draw cells
      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        const cellX = margin + colIdx * colWidth;
        const cellText = row[colIdx].replace(/\*\*/g, '').trim();

        pdf.setFont('helvetica', isHeader ? 'bold' : 'normal');
        pdf.setFontSize(isHeader ? 9 : 9);
        pdf.setTextColor(...colors.primary);

        // Truncate if too long
        let displayText = cellText;
        while (pdf.getTextWidth(displayText) > colWidth - cellPadding * 2 && displayText.length > 3) {
          displayText = displayText.slice(0, -4) + '...';
        }

        pdf.text(displayText, cellX + cellPadding, yPosition);
      }

      // Draw borders
      pdf.setDrawColor(...colors.tableBorder);
      pdf.setLineWidth(0.2);
      pdf.line(margin, yPosition + 2, margin + contentWidth, yPosition + 2);

      yPosition += rowHeight;
    }

    yPosition += 3;
  };

  // Parse and render markdown content
  const renderMarkdown = (content: string): void => {
    // Remove JSON blocks
    content = content.replace(/```json[\s\S]*?```/g, '');

    const lines = content.split('\n');
    let tableRows: string[][] = [];
    let inTable = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        if (inTable && tableRows.length > 0) {
          renderTable(tableRows);
          tableRows = [];
          inTable = false;
        }
        yPosition += 2.5;
        continue;
      }

      // Table row
      if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
        // Skip separator rows
        if (/^\|[\s\-:|]+\|$/.test(trimmedLine)) continue;

        inTable = true;
        const cells = trimmedLine.split('|').filter(c => c.trim()).map(c => c.trim());
        tableRows.push(cells);
        continue;
      }

      // If we were in a table, render it
      if (inTable && tableRows.length > 0) {
        renderTable(tableRows);
        tableRows = [];
        inTable = false;
      }

      // H2 heading
      if (trimmedLine.startsWith('## ')) {
        checkPageBreak(12);
        yPosition += 4.5;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13);
        pdf.setTextColor(...colors.primary);
        pdf.text(trimmedLine.replace('## ', ''), margin, yPosition);
        yPosition += 3;
        // Underline
        pdf.setDrawColor(...colors.tableBorder);
        pdf.setLineWidth(0.3);
        pdf.line(margin, yPosition, margin + contentWidth, yPosition);
        yPosition += 5;
        continue;
      }

      // H3 heading
      if (trimmedLine.startsWith('### ')) {
        checkPageBreak(10);
        yPosition += 3;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11.5);
        pdf.setTextColor(...colors.primary);
        pdf.text(trimmedLine.replace('### ', ''), margin, yPosition);
        yPosition += 6;
        continue;
      }

      // H4 heading
      if (trimmedLine.startsWith('#### ')) {
        checkPageBreak(8);
        yPosition += 2;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10.5);
        pdf.setTextColor(...colors.primary);
        pdf.text(trimmedLine.replace('#### ', ''), margin, yPosition);
        yPosition += 5;
        continue;
      }

      // Horizontal rule
      if (trimmedLine === '---' || trimmedLine === '***') {
        checkPageBreak(6);
        yPosition += 2;
        pdf.setDrawColor(...colors.tableBorder);
        pdf.setLineWidth(0.3);
        pdf.line(margin, yPosition, margin + contentWidth, yPosition);
        yPosition += 4;
        continue;
      }

      // Bullet point
      if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
        checkPageBreak(8);
        const bulletText = trimmedLine.slice(2);
        const bulletIndent = 5;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(...colors.secondary);
        pdf.text('•', margin + 2, yPosition);
        renderWrappedRichText(bulletText, margin + bulletIndent + 3, contentWidth - bulletIndent - 5, 10, 4, 5.5);
        continue;
      }

      // Numbered list
      const numberedMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);
      if (numberedMatch) {
        checkPageBreak(8);
        const [, num, text] = numberedMatch;
        const numIndent = 5;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(...colors.secondary);
        pdf.text(`${num}.`, margin + 1, yPosition);
        renderWrappedRichText(text, margin + numIndent + 3, contentWidth - numIndent - 5, 10, 4, 5.5);
        continue;
      }

      // Regular paragraph with bold support
      checkPageBreak(6);
      pdf.setFontSize(10);
      pdf.setTextColor(...colors.secondary);
      renderWrappedRichText(trimmedLine, margin, contentWidth, 10, 4, 5.5);
    }

    // Render any remaining table
    if (tableRows.length > 0) {
      renderTable(tableRows);
    }
  };

  // === PDF CONTENT ===

  // Process messages
  for (const message of messages) {
    if (message.isLoading) continue;

    checkPageBreak(25);

    // Message header
    const role = message.role === 'user' ? 'You' : 'Insurance AI';
    const roleColor = colors.primary;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...roleColor);
    pdf.text(role, margin, yPosition);

    // Timestamp
    if (includeTimestamps && message.timestamp) {
      const timestamp = new Date(message.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.muted);
      pdf.text(timestamp, pageWidth - margin - pdf.getTextWidth(timestamp), yPosition);
    }

    yPosition += 8.5;

    // Message content
    if (message.content) {
      renderMarkdown(message.content);
    }

    // Recommendations cards
    if (message.analysisData?.recommendations) {
      checkPageBreak(15);
      yPosition += 3;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11.5);
      pdf.setTextColor(...colors.primary);
      pdf.text('Top Recommendations', margin, yPosition);
      yPosition += 7;

      for (const rec of message.analysisData.recommendations) {
        checkPageBreak(34);

        // Section frame
        pdf.setDrawColor(...colors.tableBorder);
        pdf.setLineWidth(0.25);
        pdf.rect(margin, yPosition - 4, contentWidth, 30, 'S');

        // Rank label
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(...colors.secondary);
        pdf.text(`#${rec.rank}`, margin + 2, yPosition + 3.5);

        // Carrier name
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(...colors.primary);
        const scoreText = `${rec.matchScore}% match`;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(...colors.success);
        const scoreX = margin + contentWidth - pdf.getTextWidth(scoreText) - 3;
        const carrierMaxWidth = Math.max(20, scoreX - (margin + 14) - 4);
        const carrierText = truncateToWidth(rec.carrier, carrierMaxWidth);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(...colors.primary);
        pdf.text(carrierText, margin + 14, yPosition + 3);

        // Match score
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(...colors.success);
        pdf.text(scoreText, scoreX, yPosition + 3);

        // Appetite status
        const appetiteText = rec.appetiteStatus || 'Strong Appetite';
        pdf.setFontSize(8);
        pdf.setTextColor(...colors.secondary);
        pdf.text(truncateToWidth(appetiteText, contentWidth - 26), margin + 14, yPosition + 8.3);

        // Overview
        if (rec.overview) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(...colors.secondary);
          const overviewLines = wrapText(rec.overview, contentWidth - 18, 9);
          pdf.text(overviewLines[0] || '', margin + 14, yPosition + 15);
          if (overviewLines[1]) {
            pdf.text(overviewLines[1], margin + 14, yPosition + 19);
          }
        }

        yPosition += 34;
      }
    }

    // Message separator
    yPosition += 2;
    checkPageBreak(6);
    pdf.setDrawColor(240, 240, 240);
    pdf.setLineWidth(0.2);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 7;
  }

  // Footer
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(...colors.muted);
    pdf.text(
      'Chambers Bay Insurance AI Assistant',
      margin,
      pageHeight - 8
    );
    pdf.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - margin - pdf.getTextWidth(`Page ${i} of ${totalPages}`),
      pageHeight - 8
    );
  }

  // Save
  const filename = `insurance-chat-${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(filename);
}
