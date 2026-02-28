const H = '-';
const V = '|';

function fitLine(input: string, width: number): string {
  if (width <= 0) return '';
  if (input.length <= width) return input.padEnd(width, ' ');
  if (width <= 1) return input.slice(0, width);
  return `${input.slice(0, width - 1)}~`;
}

function normalizeLines(lines: string[], height: number, width: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < height; i += 1) {
    out.push(fitLine(lines[i] ?? '', width));
  }
  return out;
}

function borderLine(width: number): string {
  return `+${H.repeat(Math.max(0, width - 2))}+`;
}

function titleBar(title: string, width: number): string {
  if (width < 4) return borderLine(width);
  const cleanTitle = ` ${title} `;
  const room = width - 2;
  if (cleanTitle.length >= room) {
    return `+${fitLine(cleanTitle, room)}+`;
  }
  const left = Math.floor((room - cleanTitle.length) / 2);
  const right = room - cleanTitle.length - left;
  return `+${H.repeat(left)}${cleanTitle}${H.repeat(right)}+`;
}

export interface PanelFrameModel {
  width: number;
  height: number;
  header: string;
  footer: string;
  leftTitle: string;
  leftLines: string[];
  rightTitle: string;
  rightLines: string[];
  bottomTitle: string;
  bottomLines: string[];
  focusedPane?: 'left' | 'right' | 'bottom';
}

export function renderPanelFrame(model: PanelFrameModel): string {
  const width = Math.max(60, model.width || 120);
  const height = Math.max(18, model.height || 30);
  const innerWidth = width - 2;
  const bodyHeight = height - 6; // header + footer + borders
  const topHeight = Math.max(8, Math.floor(bodyHeight * 0.65));
  const bottomHeight = bodyHeight - topHeight;
  const leftWidth = Math.max(22, Math.floor(innerWidth * 0.35));
  const rightWidth = innerWidth - leftWidth - 1; // separator

  const leftContentHeight = Math.max(1, topHeight - 2);
  const rightContentHeight = Math.max(1, topHeight - 2);
  const bottomContentHeight = Math.max(1, bottomHeight - 2);

  const focused = model.focusedPane ?? 'left';
  const leftTitle = focused === 'left' ? `* ${model.leftTitle}` : model.leftTitle;
  const rightTitle = focused === 'right' ? `* ${model.rightTitle}` : model.rightTitle;
  const bottomTitle = focused === 'bottom' ? `* ${model.bottomTitle}` : model.bottomTitle;

  const lines: string[] = [];
  lines.push(titleBar(model.header, width));
  lines.push(borderLine(width));
  lines.push(`${V}${fitLine(leftTitle, leftWidth)}${V}${fitLine(rightTitle, rightWidth)}${V}`);

  const leftContent = normalizeLines(model.leftLines, leftContentHeight, leftWidth);
  const rightContent = normalizeLines(model.rightLines, rightContentHeight, rightWidth);
  for (let i = 0; i < leftContentHeight; i += 1) {
    lines.push(`${V}${leftContent[i]}${V}${rightContent[i]}${V}`);
  }

  lines.push(borderLine(width));
  lines.push(`${V}${fitLine(bottomTitle, innerWidth)}${V}`);
  const bottomContent = normalizeLines(model.bottomLines, bottomContentHeight, innerWidth);
  for (const row of bottomContent) {
    lines.push(`${V}${row}${V}`);
  }
  lines.push(borderLine(width));
  lines.push(fitLine(model.footer, width));
  return lines.join('\n');
}
