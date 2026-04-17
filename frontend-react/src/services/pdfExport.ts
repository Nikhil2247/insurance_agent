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
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let yPosition = margin;

  // Colors
  const colors = {
    primary: [30, 30, 30] as [number, number, number],
    secondary: [80, 80, 80] as [number, number, number],
    muted: [120, 120, 120] as [number, number, number],
    accent: [59, 130, 246] as [number, number, number],
    success: [34, 197, 94] as [number, number, number],
    tableHeader: [249, 250, 251] as [number, number, number],
    tableBorder: [229, 231, 235] as [number, number, number],
  };

  // Check page break
  const checkPageBreak = (requiredSpace: number): boolean => {
    if (yPosition + requiredSpace > pageHeight - margin) {
      pdf.addPage();
      yPosition = margin;
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
        pdf.rect(margin, yPosition - 4, contentWidth, rowHeight, 'F');
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
        yPosition += 2;
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
        yPosition += 4;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
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
        pdf.setFontSize(12);
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
        pdf.setFontSize(10);
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
        checkPageBreak(6);
        const bulletText = trimmedLine.slice(2);
        const bulletIndent = 5;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(...colors.secondary);
        pdf.text('•', margin + 2, yPosition);

        // Handle bold in bullet text
        const segments = parseBoldText(bulletText);
        let xPos = margin + bulletIndent + 3;

        for (const segment of segments) {
          pdf.setFont('helvetica', segment.bold ? 'bold' : 'normal');
          const segmentLines = wrapText(segment.text, contentWidth - bulletIndent - 5, 10);

          for (let j = 0; j < segmentLines.length; j++) {
            if (j > 0) {
              yPosition += 4;
              checkPageBreak(5);
              xPos = margin + bulletIndent + 3;
            }
            pdf.text(segmentLines[j], xPos, yPosition);
            if (j === 0) xPos += pdf.getTextWidth(segmentLines[j]);
          }
        }

        yPosition += 5;
        continue;
      }

      // Numbered list
      const numberedMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);
      if (numberedMatch) {
        checkPageBreak(6);
        const [, num, text] = numberedMatch;
        const numIndent = 5;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(...colors.secondary);
        pdf.text(`${num}.`, margin + 1, yPosition);

        // Handle bold in numbered text
        const segments = parseBoldText(text);
        let xPos = margin + numIndent + 3;

        for (const segment of segments) {
          pdf.setFont('helvetica', segment.bold ? 'bold' : 'normal');
          const segmentLines = wrapText(segment.text, contentWidth - numIndent - 5, 10);

          for (let j = 0; j < segmentLines.length; j++) {
            if (j > 0) {
              yPosition += 4;
              checkPageBreak(5);
              xPos = margin + numIndent + 3;
            }
            pdf.text(segmentLines[j], xPos, yPosition);
            if (j === 0) xPos += pdf.getTextWidth(segmentLines[j]);
          }
        }

        yPosition += 5;
        continue;
      }

      // Regular paragraph with bold support
      checkPageBreak(6);
      pdf.setFontSize(10);
      pdf.setTextColor(...colors.secondary);

      const segments = parseBoldText(trimmedLine);
      let xPos = margin;
      let lineY = yPosition;

      for (const segment of segments) {
        pdf.setFont('helvetica', segment.bold ? 'bold' : 'normal');
        const words = segment.text.split(' ');

        for (let w = 0; w < words.length; w++) {
          const word = words[w] + (w < words.length - 1 ? ' ' : '');
          const wordWidth = pdf.getTextWidth(word);

          if (xPos + wordWidth > margin + contentWidth && xPos > margin) {
            xPos = margin;
            lineY += 4;
            checkPageBreak(5);
          }

          pdf.text(word, xPos, lineY);
          xPos += wordWidth;
        }
      }

      yPosition = lineY + 5;
    }

    // Render any remaining table
    if (tableRows.length > 0) {
      renderTable(tableRows);
    }
  };

  // === PDF CONTENT ===

  // Title
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...colors.primary);
  pdf.text(title, margin, yPosition);
  yPosition += 8;

  // Subtitle
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...colors.muted);
  pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition);
  yPosition += 8;

  // Header separator
  pdf.setDrawColor(...colors.tableBorder);
  pdf.setLineWidth(0.5);
  pdf.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 10;

  // Process messages
  for (const message of messages) {
    if (message.isLoading) continue;

    checkPageBreak(25);

    // Message header
    const role = message.role === 'user' ? 'You' : 'Insurance AI';
    const roleColor = message.role === 'user' ? colors.secondary : colors.accent;

    // Role badge background
    pdf.setFillColor(...(message.role === 'user' ? [243, 244, 246] : [239, 246, 255]) as [number, number, number]);
    pdf.roundedRect(margin, yPosition - 4, 25, 7, 1, 1, 'F');

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...roleColor);
    pdf.text(role, margin + 2, yPosition);

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

    yPosition += 8;

    // Message content
    if (message.content) {
      renderMarkdown(message.content);
    }

    // Recommendations cards
    if (message.analysisData?.recommendations) {
      checkPageBreak(15);
      yPosition += 3;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(...colors.primary);
      pdf.text('Top Recommendations', margin, yPosition);
      yPosition += 8;

      for (const rec of message.analysisData.recommendations) {
        checkPageBreak(30);

        // Card background
        pdf.setFillColor(249, 250, 251);
        pdf.setDrawColor(...colors.tableBorder);
        pdf.roundedRect(margin, yPosition - 4, contentWidth, 28, 2, 2, 'FD');

        // Rank badge
        const rankColors: { [key: number]: [number, number, number] } = {
          1: [234, 179, 8],
          2: [156, 163, 175],
          3: [217, 119, 6]
        };
        pdf.setFillColor(...(rankColors[rec.rank] || colors.muted));
        pdf.circle(margin + 6, yPosition + 2, 4, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(255, 255, 255);
        pdf.text(String(rec.rank), margin + 4.5, yPosition + 3.5);

        // Carrier name
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(...colors.primary);
        pdf.text(rec.carrier, margin + 14, yPosition + 3);

        // Match score
        const scoreText = `${rec.matchScore}% match`;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(...colors.success);
        pdf.text(scoreText, margin + contentWidth - pdf.getTextWidth(scoreText) - 3, yPosition + 3);

        // Appetite status
        pdf.setFontSize(8);
        pdf.setTextColor(...colors.muted);
        pdf.text(rec.appetiteStatus || 'Strong Appetite', margin + 14, yPosition + 9);

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

        yPosition += 32;
      }
    }

    // Message separator
    yPosition += 3;
    checkPageBreak(6);
    pdf.setDrawColor(240, 240, 240);
    pdf.setLineWidth(0.2);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 8;
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
