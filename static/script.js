
const uploadForm = document.getElementById("upload-form");
const fileInput = document.getElementById("python-file");
const uploadArea = document.getElementById("upload-area");
const selectedFile = document.getElementById("selected-file");
const fileName = document.getElementById("file-name");
const fileSize = document.getElementById("file-size");
const removeButton = document.getElementById("remove-file");
const refactorButton = document.getElementById("refactor-button");
const message = document.getElementById("message");
const results = document.getElementById("results");
const resultSummary = document.getElementById("result-summary");
const docstringResults = document.getElementById("docstring-results");
const downloadLink = document.getElementById("download-link");

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB
let isProcessing = false;

// Format the file size for display.
function formatFileSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} bytes`;
    }

    return `${(bytes / 1024).toFixed(2)} KB`;
}

// Display a status message.
function showMessage(text, type = "") {
    message.textContent = text;
    message.className = "message";

    if (type) {
        message.classList.add(type);
    }

    message.hidden = false;
}

// Clear old results.
function clearResults() {
    results.hidden = true;
    resultSummary.replaceChildren();
    docstringResults.replaceChildren();
    downloadLink.hidden = true;
    downloadLink.removeAttribute("href");
}

// Reset the selected file.
function resetFileSelection() {
    fileInput.value = "";
    selectedFile.hidden = true;
    fileName.textContent = "";
    fileSize.textContent = "";
    uploadArea.hidden = false;
}

// Display a selected file.
function displaySelectedFile(file) {
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);

    selectedFile.hidden = false;
    uploadArea.hidden = true;
}

// Handle file selection.
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];

    if (!file) {
        return;
    }

    clearResults();

    if (!file.name.toLowerCase().endsWith(".py")) {
        resetFileSelection();
        showMessage("Please select a Python file with the .py extension.", "error");
        return;
    }

    if (file.size === 0) {
        resetFileSelection();
        showMessage("The selected file is empty. Please choose another file.", "error");
        return;
    }

    if (file.size > MAX_FILE_SIZE) {
        resetFileSelection();
        showMessage("File too large. Maximum upload size is 1 MB.", "error");
        return;
    }

    message.hidden = true;
    displaySelectedFile(file);
});

// Allow users to remove their selected file.
removeButton.addEventListener("click", () => {
    if (isProcessing) {
        return;
    }

    resetFileSelection();
    clearResults();
    message.hidden = true;
});

// Create a result card safely using textContent.
function createResultCard(functionName, docstring) {
    const card = document.createElement("article");
    card.className = "result-card";

    const heading = document.createElement("h3");
    heading.textContent = functionName;

    const description = document.createElement("p");
    description.textContent = docstring;

    card.append(heading, description);

    return card;
}

// Display the API result.
function displayResults(data) {
    const result = data.result || {};

    results.hidden = false;
    resultSummary.replaceChildren();
    docstringResults.replaceChildren();

    const summary = document.createElement("p");
    summary.textContent = result.message || "Refactoring request completed.";
    resultSummary.appendChild(summary);
    
    if (result.status === "success") {
        const count = document.createElement("p");
        count.textContent = "Functions updated: ";
        
        const number = document.createElement("strong");
        number.textContent = result.functions_updated ?? 0;
        count.appendChild(number);
        resultSummary.appendChild(count);
    }


    if (result.status === "no_changes_needed") {
        const info = document.createElement("p");
        info.textContent = "No undocumented functions needed updating.";
        resultSummary.appendChild(info);
    }

    if (result.validation_passed === true) {
        const validation = document.createElement("p");
        validation.textContent = "Validation passed.";
        validation.className = "validation-success";
        resultSummary.appendChild(validation);
    } else if (result.validation_passed === false) {
        const validation = document.createElement("p");
        validation.textContent = "Validation did not pass.";
        validation.className = "validation-failure";
        resultSummary.appendChild(validation);
    }

    const generatedDocstrings = Array.isArray(result.generated_docstrings)
        ? result.generated_docstrings
        : [];

    if (generatedDocstrings.length > 0) {
        const heading = document.createElement("h3");
        heading.textContent = "Generated docstrings";
        heading.style.marginTop = "20px";
        docstringResults.appendChild(heading);

        generatedDocstrings.forEach((item) => {
            const card = createResultCard(
                item.function_name || "Python function",
                item.docstring || "No docstring text was returned."
            );

            docstringResults.appendChild(card);
        });
    }

    const successfulStatuses = ["success", "no_changes_needed"];

    if (
        successfulStatuses.includes(result.status) &&
        typeof data.download_url === "string" &&
        data.download_url.startsWith("/download/")
    ) {
        downloadLink.href = data.download_url;
        downloadLink.hidden = false;
    }
}

// Submit the selected Python file to FastAPI.
uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isProcessing) {
        return;
    }

    const file = fileInput.files[0];

    if (!file) {
        showMessage("Please choose a Python file before continuing.", "error");
        return;
    }

    if (!file.name.toLowerCase().endsWith(".py")) {
        showMessage("Please select a valid .py file.", "error");
        return;
    }

    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
        showMessage(
            file.size === 0
                ? "The selected file is empty."
                : "File too large. Maximum upload size is 1 MB.",
            "error"
        );
        return;
    }

    isProcessing = true;
    refactorButton.disabled = true;
    refactorButton.textContent = "Refactoring... Please wait";
    removeButton.disabled = true;

    clearResults();
    showMessage("Uploading and processing your Python file. Please wait...");

    try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/refactor", {
            method: "POST",
            body: formData
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.detail || `Request failed with status ${response.status}.`
            );
        }

        displayResults(data);

        if (
            data.result &&
            ["success", "no_changes_needed"].includes(data.result.status)
        ) {
            showMessage("Processing completed.", "success");
        } else {
            showMessage(
                data.result?.message || "The refactoring process did not complete successfully.",
                "error"
            );
        }
    } catch (error) {
        showMessage(
            error.message || "Could not connect to the backend. Check that the server is running.",
            "error"
        );
    } finally {
        isProcessing = false;
        refactorButton.disabled = false;
        refactorButton.innerHTML = 'Refactor Python Code <span>→</span>';
        removeButton.disabled = false;
    }
});
