// Аддон для скачивания обложки трека — кнопка рядом с названием трека

(function () {
    'use strict';

    let currentSettings = null;
    let isDownloading = false;

    // ─── Настройки ────────────────────────────────────────────────────────────

    async function getSettings(name) {
        try {
            const response = await fetch(`http://localhost:2007/get_handle?name=${name}`);
            if (!response.ok) throw new Error(`Ошибка сети: ${response.status}`);
            const { data } = await response.json();
            if (!data?.sections) return null;
            return transformJSON(data);
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    function transformJSON(data) {
        const result = {};
        try {
            data.sections.forEach(section => {
                section.items.forEach(item => {
                    if (item.type === 'text' && item.buttons) {
                        result[item.id] = {};
                        item.buttons.forEach(btn => {
                            result[item.id][btn.id] = { value: btn.text, default: btn.defaultParameter };
                        });
                    } else {
                        result[item.id] = {
                            value: item.bool ?? item.input ?? item.selected ?? item.value ?? item.filePath,
                            default: item.defaultParameter
                        };
                    }
                });
            });
        } finally {
            return result;
        }
    }

    // ─── Получение URL обложки ────────────────────────────────────────────────

    function getCoverUrl(metaContainer) {
        // Ищем обложку в ближайшем родительском блоке плеера
        const player = metaContainer.closest('[data-test-id]') ||
                        document.querySelector('div[data-test-id="FULLSCREEN_PLAYER_MODAL"]') ||
                        document.body;

        const img = player.querySelector(
            'img[src*="avatars.yandex.net"], img[src*="music.yandex"]'
        );
        if (!img?.src) return null;

        let url = img.src;
        const quality = currentSettings?.imageQuality?.value;
        let size = '1000x1000';
        if (quality === 1) size = '200x200';
        else if (quality === 2) size = '400x400';
        else if (quality === 3) size = '1000x1000';
        else if (quality === 4) size = 'orig';

        url = size === 'orig'
            ? url.replace(/\/\d+x\d+/, '/orig')
            : url.replace(/\/\d+x\d+/, `/${size}`);

        return url;
    }

    // ─── Получение имени файла ────────────────────────────────────────────────

    function getFilename(metaContainer) {
        const titleEl  = metaContainer.querySelector('[data-test-id="TRACK_TITLE"] .Meta_title__GGBnH');
        const artistEl = metaContainer.querySelector('[data-test-id="SEPARATED_ARTIST_TITLE"] .Meta_artistCaption__JESZi');

        const title  = titleEl?.textContent.trim()  || 'Unknown';
        const artist = artistEl?.textContent.trim() || 'Unknown';

        const pattern = currentSettings?.fileNameFormat?.fileNamePattern?.value || '{artist} - {title}';
        const name = pattern.replace('{artist}', artist).replace('{title}', title);
        return name.replace(/[/\\?%*:|"<>]/g, '-') + '.jpg';
    }

    // ─── Скачивание ───────────────────────────────────────────────────────────

    async function downloadCover(metaContainer) {
        if (isDownloading) return;

        const coverUrl = getCoverUrl(metaContainer);
        if (!coverUrl) {
            showNotification('Обложка не найдена', false);
            return;
        }

        isDownloading = true;
        try {
            const filename = getFilename(metaContainer);
            const blob = await fetch(coverUrl).then(r => r.blob());

            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: filename,
                        types: [{ description: 'Изображения', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                } catch (err) {
                    if (err.name !== 'AbortError') throw err;
                    return;
                }
            } else {
                const url = URL.createObjectURL(blob);
                const a = Object.assign(document.createElement('a'), { href: url, download: filename });
                document.body.appendChild(a);
                a.click();
                URL.revokeObjectURL(url);
                a.remove();
            }

            if (currentSettings?.showNotification?.value !== false) {
                showNotification('Обложка сохранена: ' + filename, true);
            }
        } catch (err) {
            console.error('Ошибка скачивания обложки:', err);
            showNotification('Ошибка скачивания', false);
        } finally {
            isDownloading = false;
        }
    }

    // ─── Уведомление ─────────────────────────────────────────────────────────

    function showNotification(message, success = true) {
        const el = document.createElement('div');
        el.textContent = message;
        el.style.cssText = `
            position: fixed; bottom: 20px; right: 20px;
            background: ${success ? '#4CAF50' : '#f44336'};
            color: white; padding: 12px 24px; border-radius: 4px;
            z-index: 10000; font-size: 14px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            animation: cdi-slideIn 0.3s ease-out;
        `;
        document.body.appendChild(el);
        setTimeout(() => {
            el.style.animation = 'cdi-slideOut 0.3s ease-out';
            setTimeout(() => el.remove(), 300);
        }, 2000);
    }

    // ─── Создание кнопки ──────────────────────────────────────────────────────

    function createDownloadIcon() {
        const size    = currentSettings?.iconSize?.value    || 18;
        const opacity = (currentSettings?.iconOpacity?.value || 70) / 100;

        const btn = document.createElement('button');
        btn.className = 'cdi-download-icon';
        btn.title = 'Скачать обложку';
        btn.innerHTML = `
            <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor"/>
            </svg>
        `;
        btn.style.cssText = `
            background: transparent; border: none; cursor: pointer;
            padding: 4px; display: inline-flex; align-items: center;
            justify-content: center; opacity: ${opacity};
            transition: opacity 0.2s, color 0.2s; margin-left: 8px;
            vertical-align: middle;
            color: var(--ym-controls-color-primary-text-enabled_variant, #ffffff);
        `;

        btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
        btn.addEventListener('mouseleave', () => { btn.style.opacity = String(opacity); });

        return btn;
    }

    // ─── Добавление кнопки к контейнеру метаданных ───────────────────────────

    function addIconToMeta(metaContainer) {
        const titleContainer = metaContainer.querySelector('.Meta_titleContainer__gDuXr');
        if (!titleContainer) return;
        if (metaContainer.querySelector('.cdi-download-icon')) return;

        const btn = createDownloadIcon();
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            downloadCover(metaContainer);
        });

        // Если есть иконка CopyTrackName — вставляем сразу после неё
        const copyIcon = titleContainer.querySelector('.copy-track-icon');
        if (copyIcon) {
            copyIcon.insertAdjacentElement('afterend', btn);
        } else {
            titleContainer.appendChild(btn);
        }
    }

    function processAll() {
        document.querySelectorAll('.Meta_root__R8n1h').forEach(addIconToMeta);
    }

    // ─── Стили анимации ───────────────────────────────────────────────────────

    const style = document.createElement('style');
    style.textContent = `
        @keyframes cdi-slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to   { transform: translateX(0);     opacity: 1; }
        }
        @keyframes cdi-slideOut {
            from { transform: translateX(0);     opacity: 1; }
            to   { transform: translateX(400px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    // ─── MutationObserver ─────────────────────────────────────────────────────

    const observer = new MutationObserver(() => processAll());
    observer.observe(document.body, { childList: true, subtree: true });

    // ─── Обновление настроек ──────────────────────────────────────────────────

    async function updateSettings() {
        const s = await getSettings('CoverDownloaderInline');
        if (s) {
            currentSettings = s;
            // Пересоздаём иконки при изменении размера/прозрачности
            document.querySelectorAll('.cdi-download-icon').forEach(el => el.remove());
            processAll();
        }
    }

    updateSettings();
    setInterval(updateSettings, 3000);

    console.log('CoverDownloaderInline загружен');
})();
