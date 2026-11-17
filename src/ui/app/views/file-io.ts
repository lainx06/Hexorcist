// Reading a chosen file and offering a download. Everything stays in this tab: a file is read with
// File.text(), and a download is a Blob behind a temporary object URL. No request is made.

/** The file's text, read in this tab. */
export function readFileText(file: File): Promise<string> {
  return file.text();
}

/** Offers `text` as a download named `name`, then revokes the object URL. */
export function offerDownload(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}