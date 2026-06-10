const STORAGE_KEY = "libratrack-state-v1";
const FINE_PER_DAY = 5;

const today = new Date("2026-06-10T12:00:00");

const seedState = {
  books: [
   
  ],
  members: [
   
  ],
  loans: [
   
  ]
};

let state = loadState();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const views = {
  dashboard: $("#dashboardView"),
  catalog: $("#catalogView"),
  members: $("#membersView"),
  circulation: $("#circulationView")
};

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : structuredClone(seedState);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function daysBetween(start, end) {
  const ms = new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`);
  return Math.max(0, Math.ceil(ms / 86400000));
}

function activeLoans() {
  return state.loans.filter((loan) => !loan.returnedDate);
}

function bookById(id) {
  return state.books.find((book) => book.id === id);
}

function memberById(id) {
  return state.members.find((member) => member.id === id);
}

function checkedOutCount(bookId) {
  return activeLoans().filter((loan) => loan.bookId === bookId).length;
}

function availableCopies(book) {
  return book.copies - checkedOutCount(book.id);
}

function loanStatus(loan) {
  if (loan.returnedDate) return "returned";
  return new Date(`${loan.dueDate}T12:00:00`) < today ? "overdue" : "active";
}

function fineFor(loan) {
  const status = loanStatus(loan);
  const end = loan.returnedDate || today.toISOString().slice(0, 10);
  const overdueDays = daysBetween(loan.dueDate, end);
  return status === "active" ? 0 : overdueDays * FINE_PER_DAY;
}

function nextId(prefix, collection) {
  const max = collection.reduce((highest, item) => {
    const number = Number(item.id.replace(prefix, ""));
    return Number.isFinite(number) ? Math.max(highest, number) : highest;
  }, 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function setView(name) {
  Object.values(views).forEach((view) => view.classList.remove("active"));
  views[name].classList.add("active");
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === name));
}

function renderAll() {
  renderCategoryOptions();
  renderMetrics();
  renderDueList();
  renderCategoryBars();
  renderCatalog();
  renderMembers();
  renderLoans();
  persist();
}

function renderMetrics() {
  const totalCopies = state.books.reduce((sum, book) => sum + book.copies, 0);
  const totalActive = activeLoans().length;
  const overdue = activeLoans().filter((loan) => loanStatus(loan) === "overdue").length;
  const fines = state.loans.reduce((sum, loan) => sum + fineFor(loan), 0);
  const metrics = [
    ["Total Titles", state.books.length],
    ["Total Copies", totalCopies],
    ["Active Loans", totalActive],
    ["Fine Exposure", `Rs ${fines}`],
    ["Members", state.members.length],
    ["Overdue Loans", overdue],
    ["Available Copies", totalCopies - totalActive],
    ["Categories", new Set(state.books.map((book) => book.category)).size]
  ];

  $("#metricGrid").innerHTML = metrics
    .map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderDueList() {
  const risky = activeLoans()
    .map((loan) => ({ ...loan, status: loanStatus(loan) }))
    .filter((loan) => loan.status === "overdue" || daysBetween(today.toISOString().slice(0, 10), loan.dueDate) <= 7)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  $("#riskCount").textContent = `${risky.length} at risk`;
  $("#dueList").innerHTML = risky.length
    ? risky
        .map((loan) => {
          const book = bookById(loan.bookId);
          const member = memberById(loan.memberId);
          const status = loanStatus(loan);
          return `<article class="list-item">
            <div><strong>${book.title}</strong><span>${member.name} - due ${formatDate(loan.dueDate)}</span></div>
            <span class="status-pill ${status === "overdue" ? "danger" : "warning"}">${status}</span>
          </article>`;
        })
        .join("")
    : `<div class="empty">No loans are due soon.</div>`;
}

function renderCategoryBars() {
  const counts = state.books.reduce((map, book) => {
    map[book.category] = (map[book.category] || 0) + book.copies;
    return map;
  }, {});
  const max = Math.max(...Object.values(counts));

  $("#categoryBars").innerHTML = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `<div>
      <div class="bar-label"><span>${category}</span><span>${count} copies</span></div>
      <div class="bar-track"><div class="bar-fill" style="width: ${(count / max) * 100}%"></div></div>
    </div>`)
    .join("");
}

function renderCategoryOptions() {
  const selected = $("#categoryFilter").value;
  const categories = [...new Set(state.books.map((book) => book.category))].sort();
  $("#categoryFilter").innerHTML = `<option value="all">All categories</option>${categories
    .map((category) => `<option value="${category}">${category}</option>`)
    .join("")}`;
  $("#categoryFilter").value = categories.includes(selected) ? selected : "all";
}

function renderCatalog() {
  const query = $("#catalogSearch").value.trim().toLowerCase();
  const category = $("#categoryFilter").value;
  const availability = $("#availabilityFilter").value;

  const rows = state.books.filter((book) => {
    const searchable = `${book.title} ${book.author} ${book.isbn} ${book.shelf}`.toLowerCase();
    const copies = availableCopies(book);
    const matchesAvailability =
      availability === "all" || (availability === "available" ? copies > 0 : copies === 0);
    return searchable.includes(query) && (category === "all" || book.category === category) && matchesAvailability;
  });

  $("#catalogTable").innerHTML = rows.length
    ? rows
        .map((book) => {
          const copies = availableCopies(book);
          return `<tr>
            <td><strong>${book.title}</strong><small>${book.author} - ISBN ${book.isbn}</small></td>
            <td>${book.category}</td>
            <td>${book.shelf}</td>
            <td>${copies}/${book.copies}</td>
            <td><span class="status-pill ${copies > 0 ? "success" : "danger"}">${copies > 0 ? "Available" : "Checked out"}</span></td>
            <td><div class="row-actions"><button class="small-button" data-action="edit-book" data-id="${book.id}">Edit</button></div></td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="6"><div class="empty">No books match the current filters.</div></td></tr>`;
}

function renderMembers() {
  const query = $("#memberSearch").value.trim().toLowerCase();
  const type = $("#memberTypeFilter").value;
  const members = state.members.filter((member) => {
    const searchable = `${member.name} ${member.email} ${member.phone}`.toLowerCase();
    return searchable.includes(query) && (type === "all" || member.type === type);
  });

  $("#memberGrid").innerHTML = members.length
    ? members
        .map((member) => {
          const loans = activeLoans().filter((loan) => loan.memberId === member.id);
          const fines = state.loans.filter((loan) => loan.memberId === member.id).reduce((sum, loan) => sum + fineFor(loan), 0);
          return `<article class="member-card">
            <header>
              <div class="member-title-row">
                <h3>${member.name}</h3>
                <span class="status-pill">${member.type}</span>
              </div>
              <p class="member-contact"><span class="member-email">${member.email}</span><span>${member.phone}</span></p>
            </header>
            <div class="member-stats">
              <div><span>Active</span><strong>${loans.length}</strong></div>
              <div><span>Limit</span><strong>${member.limit}</strong></div>
              <div><span>Fines</span><strong>Rs ${fines}</strong></div>
            </div>
          </article>`;
        })
        .join("")
    : `<div class="empty">No members match the current filters.</div>`;
}

function renderLoans() {
  const query = $("#loanSearch").value.trim().toLowerCase();
  const filter = $("#loanStatusFilter").value;
  const loans = state.loans.filter((loan) => {
    const book = bookById(loan.bookId);
    const member = memberById(loan.memberId);
    const status = loanStatus(loan);
    const searchable = `${book.title} ${member.name} ${loan.issueDate} ${loan.dueDate}`.toLowerCase();
    return searchable.includes(query) && (filter === "all" || filter === status);
  });

  $("#loanTable").innerHTML = loans.length
    ? loans
        .map((loan) => {
          const book = bookById(loan.bookId);
          const member = memberById(loan.memberId);
          const status = loanStatus(loan);
          return `<tr>
            <td><strong>${book.title}</strong><small>${book.author}</small></td>
            <td>${member.name}<small>${member.type}</small></td>
            <td>${formatDate(loan.issueDate)}</td>
            <td>${formatDate(loan.dueDate)}</td>
            <td>Rs ${fineFor(loan)}</td>
            <td><span class="status-pill ${status === "overdue" ? "danger" : status === "returned" ? "success" : ""}">${status}</span></td>
            <td>${loan.returnedDate ? `<span class="status-pill success">Returned ${formatDate(loan.returnedDate)}</span>` : `<button class="small-button" data-action="return-book" data-id="${loan.id}">Return</button>`}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="7"><div class="empty">No loans match the current filters.</div></td></tr>`;
}

function openDialog(title, fields, onSave) {
  $("#dialogTitle").textContent = title;
  $("#dialogFields").innerHTML = fields
    .map((field) => {
      const options = field.options
        ? field.options.map((option) => `<option value="${option.value}">${option.label}</option>`).join("")
        : "";
      return `<label class="field ${field.full ? "full" : ""}">
        <span>${field.label}</span>
        ${
          field.options
            ? `<select name="${field.name}" required>${options}</select>`
            : `<input name="${field.name}" type="${field.type || "text"}" value="${field.value || ""}" ${field.min ? `min="${field.min}"` : ""} required />`
        }
      </label>`;
    })
    .join("");

  fields.forEach((field) => {
    if (field.value && field.options) {
      $("#recordForm").elements[field.name].value = field.value;
    }
  });

  $("#recordForm").onsubmit = (event) => {
    event.preventDefault();
    if (event.submitter?.value === "cancel") {
      $("#recordDialog").close();
      return;
    }
    const data = Object.fromEntries(new FormData($("#recordForm")));
    onSave(data);
    $("#recordDialog").close();
    renderAll();
  };

  $("#recordDialog").showModal();
}

function bookFields(book = {}) {
  return [
    { name: "title", label: "Title", value: book.title },
    { name: "author", label: "Author", value: book.author },
    { name: "isbn", label: "ISBN", value: book.isbn },
    { name: "category", label: "Category", value: book.category },
    { name: "shelf", label: "Shelf", value: book.shelf },
    { name: "copies", label: "Copies", type: "number", min: 1, value: book.copies || 1 }
  ];
}

function memberFields(member = {}) {
  return [
    { name: "name", label: "Full Name", value: member.name },
    { name: "type", label: "Member Type", value: member.type || "Student", options: ["Student", "Faculty", "Public"].map((type) => ({ label: type, value: type })) },
    { name: "email", label: "Email", type: "email", value: member.email },
    { name: "phone", label: "Phone", value: member.phone },
    { name: "joined", label: "Joined Date", type: "date", value: member.joined || today.toISOString().slice(0, 10) },
    { name: "limit", label: "Loan Limit", type: "number", min: 1, value: member.limit || 3 }
  ];
}

function issueFields() {
  const availableBooks = state.books.filter((book) => availableCopies(book) > 0);
  return [
    { name: "bookId", label: "Book", options: availableBooks.map((book) => ({ value: book.id, label: `${book.title} (${availableCopies(book)} available)` })), full: true },
    { name: "memberId", label: "Member", options: state.members.map((member) => ({ value: member.id, label: `${member.name} - ${member.type}` })), full: true },
    { name: "issueDate", label: "Issue Date", type: "date", value: today.toISOString().slice(0, 10) },
    { name: "dueDate", label: "Due Date", type: "date", value: "2026-06-24" }
  ];
}

function addBook() {
  openDialog("Add Book", bookFields(), (data) => {
    state.books.push({ id: nextId("B", state.books), ...data, copies: Number(data.copies) });
    showToast("Book added to catalog.");
  });
}

function editBook(id) {
  const book = bookById(id);
  openDialog("Edit Book", bookFields(book), (data) => {
    Object.assign(book, data, { copies: Number(data.copies) });
    showToast("Book details updated.");
  });
}

function addMember() {
  openDialog("Add Member", memberFields(), (data) => {
    state.members.push({ id: nextId("M", state.members), ...data, limit: Number(data.limit) });
    showToast("Member profile created.");
  });
}

function issueBook() {
  if (!state.books.some((book) => availableCopies(book) > 0) || state.members.length === 0) {
    showToast("Add available books and members before issuing.");
    return;
  }

  openDialog("Issue Book", issueFields(), (data) => {
    const member = memberById(data.memberId);
    const currentLoans = activeLoans().filter((loan) => loan.memberId === member.id).length;
    if (currentLoans >= member.limit) {
      showToast(`${member.name} has reached the loan limit.`);
      return;
    }
    state.loans.push({ id: nextId("L", state.loans), ...data, returnedDate: null });
    showToast("Book issued successfully.");
  });
}

function returnBook(id) {
  const loan = state.loans.find((item) => item.id === id);
  loan.returnedDate = today.toISOString().slice(0, 10);
  showToast(`Book returned. Fine: Rs ${fineFor(loan)}.`);
  renderAll();
}

function bindEvents() {
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));
  $("#addBookBtn").addEventListener("click", addBook);
  $("#addMemberBtn").addEventListener("click", addMember);
  $("#issueBookBtn").addEventListener("click", issueBook);
  $("#quickIssueBtn").addEventListener("click", () => {
    setView("circulation");
    issueBook();
  });
  $("#resetDataBtn").addEventListener("click", () => {
    state = structuredClone(seedState);
    renderAll();
    showToast("Demo data restored.");
  });

  ["catalogSearch", "categoryFilter", "availabilityFilter", "memberSearch", "memberTypeFilter", "loanSearch", "loanStatusFilter"].forEach((id) => {
    $(`#${id}`).addEventListener("input", renderAll);
  });

  document.body.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    if (target.dataset.action === "edit-book") editBook(target.dataset.id);
    if (target.dataset.action === "return-book") returnBook(target.dataset.id);
  });
}

bindEvents();
renderAll();
