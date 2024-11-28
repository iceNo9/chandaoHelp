// ==UserScript==
// @name         ZanTaoHelp
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Save URLs to IndexedDB and export data to CSV, with bug ID, status, and timestamps for different actions.
// @author       HuHongAn
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // 获取北京时间（格式为：年-月-日 时:分:秒）
    function getBeijingTime() {
        const utc = new Date().getTime(); // 获取当前UTC时间戳
        const offset = 0; //8 * 60 * 60 * 1000; // 北京时间相对于UTC时间的偏差
        const beijingTime = new Date(utc + offset);

        // 格式化时间为 年-月-日 时:分:秒
        const year = beijingTime.getFullYear();
        const month = String(beijingTime.getMonth() + 1).padStart(2, '0'); // 月份从0开始
        const day = String(beijingTime.getDate()).padStart(2, '0');
        const hours = String(beijingTime.getHours()).padStart(2, '0');
        const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
        const seconds = String(beijingTime.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }


    // 初始化 IndexedDB
    const DB_NAME = 'SavedURLsDB';
    const DB_STORE_NAME = 'urls';
    let db;

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = function (event) {
                db = event.target.result;
                if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
                    db.createObjectStore(DB_STORE_NAME, { keyPath: 'url' });
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

    async function saveURL(url, bug_id, defaultStatus) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(DB_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(DB_STORE_NAME);

            const getRequest = store.get(url);
            getRequest.onsuccess = function () {
                const record = getRequest.result;
                const now = getBeijingTime();
                if (record) {
                    // 如果记录已存在，更新最后一次打开时间
                    record.last_open_time = now;
                    const putRequest = store.put(record); // 更新记录
                    putRequest.onsuccess = function () {
                        console.log('URL already exists, last open time updated:', url);
                        resolve(record.status); // 返回现有的状态
                    };
                    putRequest.onerror = function (event) {
                        console.error('Error updating last open time:', event.target.error);
                        reject(event.target.error);
                    };
                } else {
                    // 保存新的记录
                    const newRecord = {
                        url,
                        bug_id,
                        status: defaultStatus,
                        first_open_time: now,
                        last_open_time: now,
                        first_ignore_time: null,
                        last_ignore_time: null,
                        first_view_time: now,
                        last_view_time: now,
                        first_analyze_time: null,
                        last_analyze_time: null,
                        first_solve_time: null,
                        last_solve_time: null
                    };
                    const addRequest = store.add(newRecord);
                    addRequest.onsuccess = function () {
                        console.log('URL saved to database:', url);
                        resolve(defaultStatus); // 返回默认状态
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

    async function clearDatabase() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(DB_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(DB_STORE_NAME);
            const clearRequest = store.clear();
            clearRequest.onsuccess = function () {
                console.log('Database cleared successfully.');
                resolve();
            };
            clearRequest.onerror = function (event) {
                console.error('Error clearing database:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    function exportToCSV(data) {
        const csvContent = [
            ['URL', 'Bug ID', 'Status', '首次打开时间', '最后一次打开时间', '首次忽略时间', '最后一次忽略时间', '首次查看时间', '最后一次查看时间', '首次分析时间', '最后一次分析时间', '首次解决时间', '最后一次解决时间'], // Header row
            ...data.map(item => [
                item.url, item.bug_id, item.status, 
                item.first_open_time, item.last_open_time, 
                item.first_ignore_time, item.last_ignore_time,
                item.first_view_time, item.last_view_time,
                item.first_analyze_time, item.last_analyze_time,
                item.first_solve_time, item.last_solve_time
            ]) // Data rows
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

    function createClearButton() {
        const button = document.createElement('button');
        button.textContent = '清空数据';
        button.style.position = 'fixed';
        button.style.right = '20px';
        button.style.top = '60%';
        button.style.transform = 'translateY(-50%)';
        button.style.backgroundColor = '#F44336';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.padding = '10px 20px';
        button.style.cursor = 'pointer';
        button.style.zIndex = '9999';
        button.addEventListener('click', async () => {
            const confirmed = confirm('确认清空数据库中的所有数据？');
            if (confirmed) {
                await clearDatabase();
                alert('数据已清空！');
            }
        });
        document.body.appendChild(button);
    }

    async function updateStatus(url, status) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(DB_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(DB_STORE_NAME);
            const getRequest = store.get(url);
            getRequest.onsuccess = function () {
                const record = getRequest.result;
                const now = getBeijingTime();
                if (record) {
                    record.status = status;
                    // 更新时间戳字段
                    switch (status) {
                        case '忽略':
                            if (!record.first_ignore_time) {
                                record.first_ignore_time = now;
                            }
                            record.last_ignore_time = now;
                            break;
                        case '查看':
                            if (!record.first_view_time) {
                                record.first_view_time = now;
                            }
                            record.last_view_time = now;
                            break;
                        case '分析':
                            if (!record.first_analyze_time) {
                                record.first_analyze_time = now;
                            }
                            record.last_analyze_time = now;
                            break;
                        case '解决':
                            if (!record.first_solve_time) {
                                record.first_solve_time = now;
                            }
                            record.last_solve_time = now;
                            break;
                    }

                    const putRequest = store.put(record);
                    putRequest.onsuccess = function () {
                        console.log(`URL: ${url} 状态更新为 ${status}`);
                        resolve();
                    };
                    putRequest.onerror = function (event) {
                        console.error('Error updating status:', event.target.error);
                        reject(event.target.error);
                    };
                }
            };
            getRequest.onerror = function (event) {
                console.error('Error fetching record to update status:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    function createStatusButtons(bug_id, url, initialStatus) {
        const statusDiv = document.createElement('div');
        statusDiv.style.position = 'fixed';
        statusDiv.style.top = '10px';
        statusDiv.style.left = '50%';
        statusDiv.style.transform = 'translateX(-50%)';
        statusDiv.style.backgroundColor = '#fff';
        statusDiv.style.padding = '10px';
        statusDiv.style.border = '1px solid #ccc';
        statusDiv.style.zIndex = '9999';

        const statusText = document.createElement('span');
        statusText.id = 'statusText';
        statusText.textContent = `当前 Bug ID: ${bug_id} 状态: ${initialStatus}`;
        statusDiv.appendChild(statusText);

        const statusButtons = ['忽略', '查看', '分析', '解决'];
        statusButtons.forEach(status => {
            const button = document.createElement('button');
            button.textContent = `设置 ${status}`;
            button.style.marginLeft = '10px';
            button.addEventListener('click', async () => {
                await updateStatus(url, status);
                statusText.textContent = `当前 Bug ID: ${bug_id} 状态: ${status}`;
            });
            statusDiv.appendChild(button);
        });

        document.body.appendChild(statusDiv);
    }

    async function main() {
        await initDB();

        const currentURL = window.location.href;
        const regex = /10\.10\.1\.150\/bug-view-(\d+)\.html/;
        const match = currentURL.match(regex);
        if (match) {
            const bug_id = match[1];
            const status = await saveURL(currentURL, bug_id, '查看'); // 默认状态为 '查看'
            createStatusButtons(bug_id, currentURL, status); // 使用状态更新界面

            createExportButton();
            createClearButton();
        }

    }

    window.addEventListener('load', () => {
        main().catch(console.error);
    });
})();
