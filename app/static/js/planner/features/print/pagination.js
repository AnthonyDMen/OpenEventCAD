/** Paginate the existing report tables at their actual printed dimensions. */
export function paginatePrintTables({ root, content, pageContent, sources, layout, setupLegendBottom, setupLegendPage }) {
  root.querySelectorAll('.print-generated-page').forEach((page) => page.remove());
  const template = pageContent.closest('.print-key-sheet');
  pageContent.replaceChildren();
  content.replaceChildren();
  const sections = sources.filter((section) => section && section.style.display !== 'none' && section.textContent.trim());
  if (!sections.length) return 0;
  let pages = 0;
  let columns, column, columnIndex, columnCount;
  const stripIds = (node) => { node.removeAttribute('id'); node.querySelectorAll('[id]').forEach((child) => child.removeAttribute('id')); return node; };
  function mountColumns(host) {
    host.replaceChildren();
    host.classList.add('print-paginated-content');
    const panel = host.parentElement;
    const style = getComputedStyle(panel);
    const width = panel.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const header = panel.classList.contains('print-key-sheet') ? panel.querySelector('.print-sheet-header') : null;
    const height = panel.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - (header ? header.getBoundingClientRect().height + (parseFloat(style.rowGap) || 0) : 0);
    host.style.width = `${width}px`;
    host.style.height = `${height}px`;
    columnCount = Math.max(1, Math.floor((width + 11.34) / (181.42 + 11.34)));
    columns = host; columnIndex = 0;
    newColumn();
  }
  function newColumn() {
    column = document.createElement('div'); column.className = 'print-paginated-column';
    column.style.width = `${(parseFloat(columns.style.width) - 11.34 * (columnCount - 1)) / columnCount}px`;
    columns.appendChild(column); columnIndex++;
  }
  function newPage() {
    let host;
    if (!pages) {
      root.classList.add('print-has-key-continuation');
      template.classList.add('print-paginated-sheet');
      host = pageContent;
    } else {
      const sheet = stripIds(template.cloneNode(true));
      sheet.classList.add('print-generated-page'); sheet.style.display = 'flex';
      host = sheet.querySelector('.print-key-page-content');
      sheet.querySelector('.print-setup-legend-page-content')?.remove();
      root.appendChild(sheet);
    }
    pages++;
    mountColumns(host);
  }
  function advance() { if (columnIndex < columnCount) newColumn(); else newPage(); }
  if (layout === 'key-pages' || setupLegendPage) newPage();
  else mountColumns(content);
  for (const section of sections) {
    const title = section.querySelector(':scope > .print-inventory-summary-title');
    for (const sourceTable of section.querySelectorAll(':scope > table')) {
      const head = sourceTable.querySelector('thead');
      const rows = Array.from(sourceTable.querySelectorAll('tbody > tr'));
      // Long notes must be able to continue, rather than becoming one unbreakable row.
      const units = rows.flatMap((row) => {
        const notes = row.querySelector('.print-notes-body');
        if (!notes || notes.textContent.length <= 350) return [row];
        return notes.textContent.match(/[\s\S]{1,350}(?:\s|$)|[\s\S]{1,350}/g).map((text) => {
          const clone = row.cloneNode(true); clone.querySelector('.print-notes-body').textContent = text; return clone;
        });
      });
      let block, body, groupHeading;
      function startBlock() {
        block = document.createElement('div'); block.className = 'print-inventory-summary';
        if (title) block.appendChild(title.cloneNode(true));
        const table = sourceTable.cloneNode(false); table.removeAttribute('id');
        if (head) table.appendChild(head.cloneNode(true));
        body = document.createElement('tbody'); table.appendChild(body); block.appendChild(table); column.appendChild(block);
      }
      startBlock();
      for (const sourceRow of units) {
        const isHeading = sourceRow.querySelector('th[colspan]') !== null;
        if (isHeading) groupHeading = sourceRow;
        let row = sourceRow.cloneNode(true); body.appendChild(row);
        if (column.scrollHeight > column.clientHeight + 1) {
          row.remove();
          // Carry an orphaned group heading with its first detail row.
          if (!isHeading && body.lastElementChild?.querySelector('th[colspan]')) body.lastElementChild.remove();
          if (!body.children.length) block.remove();
          advance(); startBlock();
          if (!isHeading && groupHeading) body.appendChild(groupHeading.cloneNode(true));
          body.appendChild(row);
        }
      }
    }
  }
  return pages;
}
