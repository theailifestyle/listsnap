const $ = (s, el = document) => el.querySelector(s);
const listsEl = $("#lists"), form = $("#composer"), errorEl = $("#error");

async function api(method, path, body, type = "application/json") {
  const res = await fetch(path, {
    method, body: body && type === "application/json" ? JSON.stringify(body) : body,
    headers: body ? { "Content-Type": type } : {},
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
  return res.status === 204 ? null : res.json();
}

function renderList(list) {
  const el = $("#list-tpl").content.firstElementChild.cloneNode(true);
  $("h2", el).textContent = list.title;
  if (list.photo_key) {
    const a = $(".thumb", el);
    a.hidden = false;
    a.href = $("img", a).src = "/" + list.photo_key;
  }
  const ul = $(".items", el);
  for (const item of list.items) ul.append(renderItem(item, el));
  $(".delete-list", el).onclick = async () => {
    if (!confirm(`Delete "${list.title}"?`)) return;
    await api("DELETE", `/api/lists/${list.id}`);
    el.remove();
    showEmpty();
  };
  updateProgress(el);
  return el;
}

function renderItem(item, listEl) {
  const li = $("#item-tpl").content.firstElementChild.cloneNode(true);
  const box = $("input[type=checkbox]", li), text = $(".text", li);
  box.checked = item.done;
  text.value = item.text;
  li.classList.toggle("done", item.done);
  box.onchange = async () => {
    li.classList.toggle("done", box.checked);
    updateProgress(listEl);
    await api("PATCH", `/api/items/${item.id}`, { done: box.checked });
  };
  text.onkeydown = (e) => e.key === "Enter" && text.blur();
  text.onblur = async () => {
    const v = text.value.trim();
    if (!v) return (text.value = item.text);
    if (v !== item.text) item.text = (await api("PATCH", `/api/items/${item.id}`, { text: v })).text;
  };
  $(".delete-item", li).onclick = async () => {
    await api("DELETE", `/api/items/${item.id}`);
    li.remove();
    updateProgress(listEl);
  };
  return li;
}

function updateProgress(listEl) {
  const all = listEl.querySelectorAll(".item").length, done = listEl.querySelectorAll(".item.done").length;
  $(".progress", listEl).textContent = all ? `${done} of ${all} done` : "No items";
}

function showEmpty() {
  if (!listsEl.querySelector(".list")) listsEl.innerHTML = '<p class="empty">Your lists will show up here.</p>';
}

async function busy(fn) {
  errorEl.textContent = "";
  form.classList.add("busy");
  $("#make").disabled = true;
  $("#make").textContent = "Thinking…";
  try {
    const list = await fn();
    $(".empty", listsEl)?.remove();
    listsEl.prepend(renderList(list));
    return true;
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    form.classList.remove("busy");
    $("#make").disabled = false;
    $("#make").textContent = "Make my list";
  }
}

form.onsubmit = async (e) => {
  e.preventDefault();
  const text = $("#text").value.trim();
  if (!text) return (errorEl.textContent = "Write a list first.");
  if (await busy(() => api("POST", "/api/lists", { text }))) $("#text").value = "";
};

// Phone photos are big: shrink to 1600 px JPEG in the browser before upload.
async function shrink(file) {
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
  } catch {
    return file;
  }
}

$("#photo").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (form.classList.contains("busy")) return;
  await busy(async () => {
    const blob = await shrink(file);
    return api("POST", "/api/lists/photo", blob, blob.type || "image/jpeg");
  });
};

async function load() {
  const s = await api("GET", "/api/status");
  const pill = (on, label) => `<span class="pill ${on ? "on" : "off"}">${label}</span>`;
  $("#status").innerHTML = pill(s.database, "Postgres") + pill(s.storage, "Object storage") +
    pill(s.ai !== "offline", s.ai === "offline" ? "AI offline mode" : "AI");
  if (!s.database) return (listsEl.innerHTML = '<p class="empty">No database yet. On Open Cloud, click <b>Create Postgres database</b> on the service page.</p>');
  listsEl.innerHTML = "";
  for (const list of await api("GET", "/api/lists")) listsEl.append(renderList(list));
  showEmpty();
}

load().catch((e) => (errorEl.textContent = e.message));
