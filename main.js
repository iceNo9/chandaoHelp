// ==UserScript==
// @name         Save URL to Local DB and Export to CSV
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Save URLs to IndexedDB and export data to CSV, with persistent storage for multiple pages.
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const DB_NAME = 'SavedURLsDB';
    const DB_STORE_NAME = 'urls';
    let db;

    // 初始化 IndexedDB
    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = function (event) {
                db = event.target.result;
                if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
                    db.createObjectStore(DB_STORE_NAME, { keyPath: 'url' }); // 按 URL 作为唯一键
                }
            };
            request.onsuccess = function (event) {
                db = event.target.result;
                resolve(db);
            };
            request.onerror = function (event) {
                console.error('Error opening IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    // 保存 URL
    function saveURL(url) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(DB_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(DB_STORE_NAME);

            // 检查是否已存在该 URL
            const getRequest = store.get(url);
            getRequest.onsuccess = function () {
                if (getRequest.result) {
                    console.log('URL already exists in the database:', url);
                    resolve(false); // 已存在，跳过保存
                } else {
                    // 如果不存在，存入数据库
                    const addRequest = store.add({ url });
                    addRequest.onsuccess = function () {
                        console.log('URL saved to database:', url);
                        resolve(true);
                    };
                    addRequest.onerror = function (event) {
                        console.error('Error saving URL:', event.target.error);
                        reject(event.target.error);
                    };
                }
            };
            getRequest.onerror = function (event) {
                console.error('Error checking URL existence:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    // 获取所有 URLs
    function fetchAllURLs() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(DB_STORE_NAME, 'readonly');
            const store = transaction.objectStore(DB_STORE_NAME);
            const request = store.getAll();
            request.onsuccess = function () {
                resolve(request.result);
            };
            request.onerror = function (event) {
                console.error('Error fetching data:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    // 导出数据到 CSV
    function exportToCSV(data) {
        const csvContent = [
            ['URL'], // Header row
            ...data.map(item => [item.url]) // Data rows
        ]
            .map(e => e.join(',')) // Join columns with commas
            .join('\n'); // Join rows with newlines

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'urls.csv';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // 创建导出按钮
    function createExportButton() {
        const button = document.createElement('button');
        button.textContent = '导出数据';
        button.style.position = 'fixed';
        button.style.right = '20px';
        button.style.top = '50%';
        button.style.transform = 'translateY(-50%)';
        button.style.backgroundColor = '#4CAF50';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.padding = '10px 20px';
        button.style.cursor = 'pointer';
        button.style.zIndex = '9999';
        button.addEventListener('click', async () => {
            const data = await fetchAllURLs();
            if (data.length > 0) {
                exportToCSV(data);
            } else {
                alert('数据库中无数据可导出！');
            }
        });
        document.body.appendChild(button);
    }

    // 主逻辑
    async function main() {
        await initDB();

        // 保存当前 URL
        const currentURL = window.location.href;
        const saved = await saveURL(currentURL);
        if (saved) {
            console.log('当前页面的 URL 已保存:', currentURL);
        }

        // 创建导出按钮（每个页面只需要一个按钮）
        if (!document.querySelector('button#exportButton')) {
            createExportButton();
        }
    }

    // 监听页面加载完成
    window.addEventListener('load', () => {
        main().catch(console.error);
    });
})();
