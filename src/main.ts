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

    constructor() {
        this.fileInput = document.getElementById('file-input') as HTMLInputElement;
        this.openFileButton = document.getElementById('open-file-button') as HTMLButtonElement;
        this.checkLinksButton = document.getElementById('check-links-button') as HTMLButtonElement;
        this.recheckButton = document.getElementById('recheck-button') as HTMLButtonElement;
        this.saveButton = document.getElementById('save-button') as HTMLButtonElement;
        this.statusArea = document.getElementById('status-area') as HTMLDivElement;
        this.treeContainer = document.getElementById('bookmark-tree-container') as HTMLDivElement;
        
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
                const data = JSON.parse(content);
                
                if (this.validateBookmarkData(data)) {
                    this.bookmarkData = data;
                    this.renderBookmarkTree();
                    this.checkLinksButton.disabled = false;
                    this.showStatus('ブックマークファイルを読み込みました', 'success');
                } else {
                    this.showStatus('無効なブックマークファイルです。', 'error');
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
        this.showStatus('再チェックが完了しました', 'success');
    }

    private saveBookmarks(): void {
        if (!this.bookmarkData) return;
        
        const newData = this.deepClone(this.bookmarkData);
        this.removeSelectedBookmarks(newData.roots);
        
        const jsonString = JSON.stringify(newData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const date = new Date();
        const dateString = date.getFullYear() +
                          String(date.getMonth() + 1).padStart(2, '0') +
                          String(date.getDate()).padStart(2, '0');
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `Bookmarks_${dateString}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
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
}

document.addEventListener('DOMContentLoaded', () => {
    new BookmarkManager();
});