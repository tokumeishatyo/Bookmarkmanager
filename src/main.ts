interface ChromeBookmark {
    id: string;
    name: string;
    type: 'url' | 'folder';
    url?: string;
    children?: ChromeBookmark[];
    date_added?: string;
    date_modified?: string;
}

interface ChromeBookmarkRoot {
    roots: {
        bookmark_bar: ChromeBookmark;
        other: ChromeBookmark;
        synced?: ChromeBookmark;
    };
    version: number;
}

class BookmarkManager {
    private fileInput: HTMLInputElement;
    private openFileButton: HTMLButtonElement;
    private checkLinksButton: HTMLButtonElement;
    private recheckButton: HTMLButtonElement;
    private saveButton: HTMLButtonElement;
    private statusArea: HTMLDivElement;
    private treeContainer: HTMLDivElement;
    
    private bookmarkData: ChromeBookmarkRoot | null = null;
    private selectedBookmarks: Set<string> = new Set();
    private errorBookmarks: Set<string> = new Set();
    private isRecheckMode: boolean = false;
    private fileFormat: 'json' | 'html' = 'json'; // 読み込んだファイル形式を記憶
    
    // 統計情報用の要素
    private totalCountElement: HTMLElement;
    private okCountElement: HTMLElement;
    private notFoundCountElement: HTMLElement;
    private errorCountElement: HTMLElement;
    private selectedCountElement: HTMLElement;

    constructor() {
        this.fileInput = document.getElementById('file-input') as HTMLInputElement;
        this.openFileButton = document.getElementById('open-file-button') as HTMLButtonElement;
        this.checkLinksButton = document.getElementById('check-links-button') as HTMLButtonElement;
        this.recheckButton = document.getElementById('recheck-button') as HTMLButtonElement;
        this.saveButton = document.getElementById('save-button') as HTMLButtonElement;
        this.statusArea = document.getElementById('status-area') as HTMLDivElement;
        this.treeContainer = document.getElementById('bookmark-tree-container') as HTMLDivElement;
        
        // 統計情報要素の取得
        this.totalCountElement = document.getElementById('total-count') as HTMLElement;
        this.okCountElement = document.getElementById('ok-count') as HTMLElement;
        this.notFoundCountElement = document.getElementById('not-found-count') as HTMLElement;
        this.errorCountElement = document.getElementById('error-count') as HTMLElement;
        this.selectedCountElement = document.getElementById('selected-count') as HTMLElement;
        
        this.initializeEventListeners();
    }

    private initializeEventListeners(): void {
        this.openFileButton.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.checkLinksButton.addEventListener('click', () => this.checkAllLinks());
        this.recheckButton.addEventListener('click', () => this.recheckErrorLinks());
        this.saveButton.addEventListener('click', () => this.saveBookmarks());
    }

    private handleFileSelect(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                
                // HTMLファイルの場合
                if (file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm')) {
                    this.fileFormat = 'html';
                    this.parseHTMLBookmarks(content);
                } else {
                    // JSONファイルまたは拡張子なしファイル（Bookmarks）として試す
                    try {
                        const data = JSON.parse(content);
                        if (this.validateBookmarkData(data)) {
                            this.fileFormat = 'json';
                            this.bookmarkData = data;
                            this.renderBookmarkTree();
                            this.updateStats();
                            this.checkLinksButton.disabled = false;
                            this.showStatus('ブックマークファイルを読み込みました', 'success');
                        } else {
                            this.showStatus('無効なブックマークファイルです。', 'error');
                        }
                    } catch (jsonError) {
                        // JSONパースに失敗した場合、HTMLとして再試行
                        this.fileFormat = 'html';
                        this.parseHTMLBookmarks(content);
                    }
                }
            } catch (error) {
                this.showStatus('ファイルの読み込みに失敗しました。', 'error');
            }
        };
        
        reader.readAsText(file);
    }

    private validateBookmarkData(data: any): data is ChromeBookmarkRoot {
        return data && 
               data.roots && 
               (data.roots.bookmark_bar || data.roots.other);
    }


    private renderBookmarkTree(): void {
        if (!this.bookmarkData) return;
        
        this.treeContainer.innerHTML = '';
        const rootList = document.createElement('ul');
        
        if (this.bookmarkData.roots.bookmark_bar) {
            rootList.appendChild(this.createFolderElement(this.bookmarkData.roots.bookmark_bar));
        }
        
        if (this.bookmarkData.roots.other) {
            rootList.appendChild(this.createFolderElement(this.bookmarkData.roots.other));
        }
        
        if (this.bookmarkData.roots.synced) {
            rootList.appendChild(this.createFolderElement(this.bookmarkData.roots.synced));
        }
        
        this.treeContainer.appendChild(rootList);
    }

    private createFolderElement(bookmark: ChromeBookmark): HTMLElement {
        const li = document.createElement('li');
        li.className = 'folder';
        
        const folderName = document.createElement('div');
        folderName.className = 'folder-name';
        folderName.textContent = bookmark.name;
        li.appendChild(folderName);
        
        if (bookmark.children && bookmark.children.length > 0) {
            const childList = document.createElement('ul');
            bookmark.children.forEach(child => {
                if (child.type === 'folder') {
                    childList.appendChild(this.createFolderElement(child));
                } else if (child.type === 'url') {
                    // 再チェックモードの場合、エラーのないブックマークはスキップ
                    if (!this.isRecheckMode || this.errorBookmarks.has(child.id)) {
                        childList.appendChild(this.createBookmarkElement(child));
                    }
                }
            });
            // 子要素がある場合のみリストを追加
            if (childList.children.length > 0) {
                li.appendChild(childList);
            }
        }
        
        return li;
    }

    private createBookmarkElement(bookmark: ChromeBookmark): HTMLElement {
        const li = document.createElement('li');
        li.className = 'bookmark-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'bookmark-checkbox';
        checkbox.dataset.bookmarkId = bookmark.id;
        checkbox.addEventListener('change', () => this.handleCheckboxChange());
        
        // 再チェックモードでエラーがある場合はリンクを作成
        if (this.isRecheckMode && this.errorBookmarks.has(bookmark.id)) {
            const link = document.createElement('a');
            link.className = 'bookmark-name bookmark-link';
            link.textContent = bookmark.name;
            link.href = bookmark.url || '#';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.title = bookmark.url || '';
            
            const statusIcon = document.createElement('span');
            statusIcon.className = 'status-icon';
            statusIcon.dataset.bookmarkId = bookmark.id;
            
            li.appendChild(checkbox);
            li.appendChild(link);
            li.appendChild(statusIcon);
        } else {
            const name = document.createElement('span');
            name.className = 'bookmark-name';
            name.textContent = bookmark.name;
            name.title = bookmark.url || '';
            
            const statusIcon = document.createElement('span');
            statusIcon.className = 'status-icon';
            statusIcon.dataset.bookmarkId = bookmark.id;
            
            li.appendChild(checkbox);
            li.appendChild(name);
            li.appendChild(statusIcon);
        }
        
        return li;
    }

    private handleCheckboxChange(): void {
        const checkboxes = this.treeContainer.querySelectorAll('.bookmark-checkbox:checked');
        this.saveButton.disabled = checkboxes.length === 0;
        
        this.selectedBookmarks.clear();
        checkboxes.forEach(checkbox => {
            const id = (checkbox as HTMLInputElement).dataset.bookmarkId;
            if (id) this.selectedBookmarks.add(id);
        });
        
        this.updateStats();
    }

    private showStatus(message: string, type: 'info' | 'error' | 'success' = 'info'): void {
        this.statusArea.textContent = message;
        this.statusArea.className = `status-area active ${type}`;
    }

    private async checkAllLinks(): Promise<void> {
        if (!this.bookmarkData) return;
        
        this.checkLinksButton.disabled = true;
        this.recheckButton.disabled = true;
        this.errorBookmarks.clear();
        this.isRecheckMode = false;
        
        // 通常モードで再描画
        this.renderBookmarkTree();
        
        this.showStatus('リンクをチェック中...', 'info');
        
        const bookmarks = this.collectAllBookmarks(this.bookmarkData.roots);
        const total = bookmarks.length;
        let checked = 0;
        
        const progressHtml = `
            <div>チェック中: <span id="progress-count">0</span> / ${total}</div>
            <div class="progress-bar">
                <div class="progress-bar-fill" style="width: 0%"></div>
            </div>
        `;
        this.statusArea.innerHTML = progressHtml;
        this.statusArea.className = 'status-area active info';
        
        const updateProgress = () => {
            const progressCount = document.getElementById('progress-count');
            const progressBar = this.statusArea.querySelector('.progress-bar-fill') as HTMLElement;
            if (progressCount) progressCount.textContent = checked.toString();
            if (progressBar) progressBar.style.width = `${(checked / total) * 100}%`;
        };
        
        // 同時接続数を制限するためのキュー処理
        const concurrencyLimit = 5; // 同時に5つまで
        const queue = [...bookmarks];
        const results: Promise<void>[] = [];
        
        const processQueue = async () => {
            while (queue.length > 0) {
                const bookmark = queue.shift();
                if (!bookmark || !bookmark.url) {
                    checked++;
                    updateProgress();
                    continue;
                }
                
                await this.checkSingleBookmark(bookmark);
                checked++;
                updateProgress();
            }
        };
        
        // 並列処理を開始
        for (let i = 0; i < concurrencyLimit; i++) {
            results.push(processQueue());
        }
        
        await Promise.all(results);
        
        this.checkLinksButton.disabled = false;
        // エラーがある場合のみ再チェックボタンを有効化
        this.recheckButton.disabled = this.errorBookmarks.size === 0;
        this.handleCheckboxChange();
        this.updateStats();
        this.showStatus('リンクチェックが完了しました', 'success');
    }

    private async checkSingleBookmark(bookmark: ChromeBookmark): Promise<void> {
        const icon = this.treeContainer.querySelector(`[data-bookmark-id="${bookmark.id}"].status-icon`) as HTMLElement;
        
        try {
            // no-corsモードを使用してCORS制限を回避
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒のタイムアウトに延長
            
            await fetch(bookmark.url!, {
                method: 'GET',
                mode: 'no-cors',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (icon) {
                icon.textContent = '😊';
                icon.style.color = '';
                this.errorBookmarks.delete(bookmark.id);
            }
        } catch (error: any) {
            if (icon) {
                if (error.name === 'AbortError') {
                    icon.textContent = 'TIME';
                    icon.style.color = '#e67e22';
                    this.errorBookmarks.add(bookmark.id);
                } else {
                    // 別の方法を試す：通常のfetchでCORSエラーを含む詳細を取得
                    try {
                        const response = await fetch(bookmark.url!, {
                            method: 'HEAD',
                            signal: AbortSignal.timeout(20000) // 20秒のタイムアウト
                        });
                        
                        if (response.status === 404) {
                            icon.textContent = '💀';
                            icon.style.color = '';
                            this.errorBookmarks.add(bookmark.id);
                            const checkbox = this.treeContainer.querySelector(`[data-bookmark-id="${bookmark.id}"].bookmark-checkbox`) as HTMLInputElement;
                            if (checkbox) {
                                checkbox.checked = true;
                            }
                        } else if (response.ok) {
                            icon.textContent = '😊';
                            icon.style.color = '';
                            this.errorBookmarks.delete(bookmark.id);
                        } else {
                            icon.textContent = response.status.toString();
                            icon.style.color = '#e74c3c';
                            this.errorBookmarks.add(bookmark.id);
                        }
                    } catch (innerError) {
                        // CORSエラーまたはネットワークエラー
                        icon.textContent = 'CORS';
                        icon.style.color = '#95a5a6';
                        this.errorBookmarks.add(bookmark.id);
                    }
                }
            }
        }
    }

    private collectAllBookmarks(roots: ChromeBookmarkRoot['roots']): ChromeBookmark[] {
        const bookmarks: ChromeBookmark[] = [];
        
        const traverse = (node: ChromeBookmark) => {
            if (node.type === 'url' && node.url) {
                bookmarks.push(node);
            } else if (node.children) {
                node.children.forEach(child => traverse(child));
            }
        };
        
        if (roots.bookmark_bar) traverse(roots.bookmark_bar);
        if (roots.other) traverse(roots.other);
        if (roots.synced) traverse(roots.synced);
        
        return bookmarks;
    }

    private async recheckErrorLinks(): Promise<void> {
        if (!this.bookmarkData || this.errorBookmarks.size === 0) return;
        
        this.recheckButton.disabled = true;
        this.isRecheckMode = true;
        
        // 画面を再描画してエラーのあるブックマークのみ表示
        this.renderBookmarkTree();
        
        this.showStatus('エラーのあるリンクを再チェック中...', 'info');
        
        const bookmarks = this.collectAllBookmarks(this.bookmarkData.roots)
            .filter(bookmark => this.errorBookmarks.has(bookmark.id));
        const total = bookmarks.length;
        let checked = 0;
        
        const progressHtml = `
            <div>再チェック中: <span id="progress-count">0</span> / ${total}</div>
            <div class="progress-bar">
                <div class="progress-bar-fill" style="width: 0%"></div>
            </div>
        `;
        this.statusArea.innerHTML = progressHtml;
        this.statusArea.className = 'status-area active info';
        
        const updateProgress = () => {
            const progressCount = document.getElementById('progress-count');
            const progressBar = this.statusArea.querySelector('.progress-bar-fill') as HTMLElement;
            if (progressCount) progressCount.textContent = checked.toString();
            if (progressBar) progressBar.style.width = `${(checked / total) * 100}%`;
        };
        
        // 同時接続数を制限するためのキュー処理
        const concurrencyLimit = 5; // 同時に5つまで
        const queue = [...bookmarks];
        const results: Promise<void>[] = [];
        
        const processQueue = async () => {
            while (queue.length > 0) {
                const bookmark = queue.shift();
                if (!bookmark || !bookmark.url) {
                    checked++;
                    updateProgress();
                    continue;
                }
                
                await this.checkSingleBookmark(bookmark);
                checked++;
                updateProgress();
            }
        };
        
        // 並列処理を開始
        for (let i = 0; i < concurrencyLimit; i++) {
            results.push(processQueue());
        }
        
        await Promise.all(results);
        
        // エラーがまだある場合のみ再チェックボタンを有効化
        this.recheckButton.disabled = this.errorBookmarks.size === 0;
        this.handleCheckboxChange();
        this.updateStats();
        this.showStatus('再チェックが完了しました', 'success');
    }

    private saveBookmarks(): void {
        if (!this.bookmarkData) return;
        
        const newData = this.deepClone(this.bookmarkData);
        this.removeSelectedBookmarks(newData.roots);
        
        const date = new Date();
        const dateString = date.getFullYear() +
                          String(date.getMonth() + 1).padStart(2, '0') +
                          String(date.getDate()).padStart(2, '0');
        
        if (this.fileFormat === 'html') {
            // HTML形式で出力
            const htmlContent = this.convertToHTML(newData.roots);
            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `Bookmarks_${dateString}.html`;
            a.click();
            
            URL.revokeObjectURL(url);
        } else {
            // JSON形式で出力
            const jsonString = JSON.stringify(newData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `Bookmarks_${dateString}`;
            a.click();
            
            URL.revokeObjectURL(url);
        }
        
        this.showStatus('ブックマークファイルを保存しました', 'success');
    }

    private deepClone<T>(obj: T): T {
        return JSON.parse(JSON.stringify(obj));
    }

    private removeSelectedBookmarks(roots: ChromeBookmarkRoot['roots']): void {
        const removeFromNode = (node: ChromeBookmark): boolean => {
            if (node.type === 'url' && this.selectedBookmarks.has(node.id)) {
                return true;
            }
            
            if (node.children) {
                node.children = node.children.filter(child => !removeFromNode(child));
            }
            
            return false;
        };
        
        if (roots.bookmark_bar) removeFromNode(roots.bookmark_bar);
        if (roots.other) removeFromNode(roots.other);
        if (roots.synced) removeFromNode(roots.synced);
    }

    private updateStats(): void {
        if (!this.bookmarkData) {
            this.totalCountElement.textContent = '0';
            this.okCountElement.textContent = '0';
            this.notFoundCountElement.textContent = '0';
            this.errorCountElement.textContent = '0';
            this.selectedCountElement.textContent = '0';
            return;
        }

        const allBookmarks = this.collectAllBookmarks(this.bookmarkData.roots);
        const total = allBookmarks.length;
        
        let okCount = 0;
        let notFoundCount = 0;
        let errorCount = 0;
        
        allBookmarks.forEach(bookmark => {
            const icon = this.treeContainer.querySelector(`[data-bookmark-id="${bookmark.id}"].status-icon`) as HTMLElement;
            if (icon && icon.textContent) {
                const status = icon.textContent;
                if (status === '😊') {
                    okCount++;
                } else if (status === '💀') {
                    notFoundCount++;
                } else if (status !== '') {
                    errorCount++;
                }
            }
        });
        
        this.totalCountElement.textContent = total.toString();
        this.okCountElement.textContent = okCount.toString();
        this.notFoundCountElement.textContent = notFoundCount.toString();
        this.errorCountElement.textContent = errorCount.toString();
        this.selectedCountElement.textContent = this.selectedBookmarks.size.toString();
    }

    private parseHTMLBookmarks(htmlContent: string): void {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            
            // Chrome形式のブックマークデータに変換
            const bookmarkData: ChromeBookmarkRoot = {
                roots: {
                    bookmark_bar: {
                        id: '1',
                        name: 'ブックマークバー',
                        type: 'folder',
                        children: []
                    },
                    other: {
                        id: '2',
                        name: 'その他のブックマーク',
                        type: 'folder',
                        children: []
                    }
                },
                version: 1
            };
            
            let bookmarkId = 100; // IDカウンター
            
            // 再帰的にDL要素をパース
            const parseDL = (dlElement: Element): ChromeBookmark[] => {
                const result: ChromeBookmark[] = [];
                let currentFolder: ChromeBookmark | null = null;
                
                // DLの直接の子要素を処理
                for (let i = 0; i < dlElement.children.length; i++) {
                    const child = dlElement.children[i];
                    
                    if (child.tagName === 'P') {
                        // <p>タグはスキップ
                        continue;
                    } else if (child.tagName === 'DT') {
                        // DTタグの中身を確認
                        const h3 = child.querySelector('h3');
                        const a = child.querySelector('a');
                        
                        if (h3) {
                            // フォルダ
                            currentFolder = {
                                id: String(bookmarkId++),
                                name: h3.textContent || 'フォルダ',
                                type: 'folder',
                                children: []
                            };
                            result.push(currentFolder);
                            
                            // 次の要素がDLかどうかチェック
                            if (i + 1 < dlElement.children.length && dlElement.children[i + 1].tagName === 'DL') {
                                // 次のDL要素を処理
                                const nextDL = dlElement.children[i + 1];
                                currentFolder.children = parseDL(nextDL);
                                i++; // DL要素もスキップ
                            }
                        } else if (a) {
                            // ブックマーク
                            const bookmark: ChromeBookmark = {
                                id: String(bookmarkId++),
                                name: a.textContent || 'ブックマーク',
                                type: 'url',
                                url: a.getAttribute('href') || ''
                            };
                            result.push(bookmark);
                        }
                    }
                }
                
                return result;
            };
            
            
            // body直下のDLから開始
            const bodyDL = doc.querySelector('body > dl');
            if (bodyDL) {
                const allItems = parseDL(bodyDL);
                
                // トップレベルのフォルダを判別して振り分け
                for (const item of allItems) {
                    if (item.type === 'folder') {
                        const folderName = item.name.toLowerCase();
                        
                        // ブックマークバーの識別
                        if (folderName.includes('ブックマーク') && folderName.includes('バー') ||
                            folderName.includes('bookmarks') && folderName.includes('bar') ||
                            folderName === 'bookmarks bar') {
                            // ブックマークバーの中身を移動
                            if (item.children) {
                                bookmarkData.roots.bookmark_bar.children = item.children;
                            }
                        }
                        // その他のブックマークの識別
                        else if (folderName.includes('その他') || 
                                 folderName.includes('other') ||
                                 folderName === 'other bookmarks') {
                            // その他のブックマークの中身を移動
                            if (item.children) {
                                bookmarkData.roots.other.children = item.children;
                            }
                        }
                        // それ以外はブックマークバーに追加
                        else {
                            bookmarkData.roots.bookmark_bar.children!.push(item);
                        }
                    } else {
                        // トップレベルのブックマークはブックマークバーに追加
                        bookmarkData.roots.bookmark_bar.children!.push(item);
                    }
                }
            }
            
            // データを設定して表示
            this.bookmarkData = bookmarkData;
            this.renderBookmarkTree();
            this.updateStats();
            this.checkLinksButton.disabled = false;
            this.showStatus('HTMLブックマークファイルを読み込みました', 'success');
            
        } catch (error) {
            this.showStatus('HTMLファイルの解析に失敗しました。', 'error');
        }
    }

    private convertToHTML(roots: ChromeBookmarkRoot['roots']): string {
        const convertNode = (node: ChromeBookmark): string => {
            if (node.type === 'folder') {
                let html = `<DT><H3>${this.escapeHTML(node.name)}</H3>\n<DD><DL>\n`;
                if (node.children) {
                    for (const child of node.children) {
                        html += convertNode(child);
                    }
                }
                html += '</DL></DD>\n';
                return html;
            } else if (node.type === 'url') {
                return `<DT><A HREF="${this.escapeHTML(node.url || '')}">${this.escapeHTML(node.name)}</A>\n`;
            }
            return '';
        };
        
        let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL>\n`;
        
        // ブックマークバー
        if (roots.bookmark_bar && roots.bookmark_bar.children) {
            html += '<DT><H3>ブックマークバー</H3>\n<DD><DL>\n';
            for (const child of roots.bookmark_bar.children) {
                html += convertNode(child);
            }
            html += '</DL></DD>\n';
        }
        
        // その他のブックマーク
        if (roots.other && roots.other.children) {
            html += '<DT><H3>その他のブックマーク</H3>\n<DD><DL>\n';
            for (const child of roots.other.children) {
                html += convertNode(child);
            }
            html += '</DL></DD>\n';
        }
        
        html += '</DL>\n';
        return html;
    }

    private escapeHTML(str: string): string {
        return str.replace(/[&<>"']/g, (match) => {
            const escapeMap: { [key: string]: string } = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            };
            return escapeMap[match];
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new BookmarkManager();
});