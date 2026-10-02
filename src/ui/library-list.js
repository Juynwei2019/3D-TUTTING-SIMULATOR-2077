export function renderLibraryList(items, listElId, emptyElId, handlers, emptyText, document = globalThis.document){
  const host = document.getElementById(listElId);
  host.innerHTML = "";
  if (items.length === 0){
    const empty = document.createElement("span");
    empty.id = emptyElId;
    empty.className = "libEmpty";
    empty.textContent = emptyText || "";
    host.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const chip = document.createElement("div");
    chip.className = "libChip";

    const sel = document.createElement("button");
    sel.className = "sel";
    sel.title = "套用「" + item.name + "」";
    sel.onclick = () => handlers.apply(item);
    const nameSpan = document.createElement("span");
    nameSpan.className = "selName";
    nameSpan.textContent = item.name;
    sel.appendChild(nameSpan);
    if (typeof handlers.subtitle === "function"){
      const subText = handlers.subtitle(item);
      if (subText){
        const subSpan = document.createElement("span");
        subSpan.className = "selSub";
        subSpan.textContent = subText;
        sel.appendChild(subSpan);
      }
    }
    chip.appendChild(sel);

    if (typeof handlers.rename === "function"){
      const ren = document.createElement("button");
      ren.className = "ren";
      ren.textContent = "✎";
      ren.title = "重新命名「" + item.name + "」";
      ren.onclick = (ev) => { ev.stopPropagation(); handlers.rename(item); };
      chip.appendChild(ren);
    }

    const exp = document.createElement("button");
    exp.className = "exp";
    exp.textContent = "⬇";
    exp.title = "匯出「" + item.name + "」為 JSON 檔";
    exp.onclick = (ev) => { ev.stopPropagation(); handlers.exportOne(item); };
    chip.appendChild(exp);

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "×";
    del.title = "刪除「" + item.name + "」";
    del.onclick = (ev) => { ev.stopPropagation(); handlers.del(item); };
    chip.appendChild(del);

    host.appendChild(chip);
  });
}
