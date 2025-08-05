document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE = '/api';
    let items = [];
    let cart = [];
    let currentFaction = '';

    // Загрузка данных с API
    try {
        const [itemsRes, factionsRes, categoriesRes] = await Promise.all([
            fetch(`${API_BASE}/items`),
            fetch(`${API_BASE}/factions`),
            fetch(`${API_BASE}/categories`)
        ]);

        const itemsData = await itemsRes.json();
        const factionsData = await factionsRes.json();
        const categoriesData = await categoriesRes.json();

        // Сохраняем данные
        items = itemsData;

        // Заполняем фильтры
        populateSelect('#factionFilter', ['All', 'Warden', 'Colonial']);

        // Заполняем список предметов
        renderItemGrid(items);
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Failed to load data from server');
    }

    // Обработчики событий
    document.getElementById('factionFilter').addEventListener('change', filterItems);

    // Функции
    function populateSelect(selector, options) {
        const select = document.querySelector(selector);
        options.forEach(opt => {
            if (opt) select.add(new Option(opt, opt));
        });
    }

    function renderItemGrid(filteredItems) {
        const grid = document.getElementById('itemGrid');
        grid.innerHTML = '';

        const grouped = groupByCategory(filteredItems);

        for (const [category, items] of Object.entries(grouped)) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'mb-3';
            categoryDiv.innerHTML = `<h3>${category}</h3>`;
            grid.appendChild(categoryDiv);

            const row = document.createElement('div');
            row.className = 'row';
            categoryDiv.appendChild(row);

            items.forEach(item => {
                const card = document.createElement('div');
                card.className = 'item-card col-md-1';
                card.innerHTML = `<img src="${item.iconUrl}" alt="${item.name}">`;
                row.appendChild(card);

                // Добавление Tippy.js тултип без задержки и без следования за курсором
                tippy(card, {
                    content: `
                        <div class="tooltip-container">
                            <h5 class="tooltip-header">${item.name} x${item.quantity_per_crate}</h5>
                            <p class="tooltip-text">${item.production_time_seconds} sec</p>
                            <div class="tooltip-row">
                                ${item.materials.map(m => `<img src="${m.iconUrl}" alt="${m.name}" class="tooltip-image"> ${m.quantity}`).join('<br>') }
                            </div>
                        </div>
                    `,
                    allowHTML: true,
                    interactive: false,
                    delay: [100, 0],
                    duration: 100,
                    animation: 'scale',
                    theme: 'light-border',
                    appendTo: () => card,
                    followCursor: false,
                });
                card.addEventListener('click', () => addToCart(item));
            });
        }
    }

    function groupByCategory(items) {
        const grouped = {};
        items.forEach(item => {
            if (!grouped[item.category_name]) {
                grouped[item.category_name] = [];
            }
            grouped[item.category_name].push(item);
        });
        return grouped;
    }

    function filterItems() {
        const faction = document.getElementById('factionFilter').value;
        let filtered = [...items];

        if (faction === 'Warden' || faction === 'Colonial') {
            filtered = filtered.filter(i => i.faction === faction || i.faction === 'Neutral');
        }

        renderItemGrid(filtered);
    }

    function addToCart(item) {
    // Создаем копию с уникальным идентификатором
        const cartItem = { 
            ...item, 
            cartId: Date.now() + Math.random() // Уникальный ID
        };
        cart.push(cartItem);
        renderCart();
    }

    function removeFromCart(cartId) {
        cart = cart.filter(item => item.cartId !== cartId);
        renderCart();
    }

    // Обновите функцию renderCart в script.js
    function renderCart() {
        const cartDiv = document.getElementById('cart');
        cartDiv.innerHTML = '';

        // Добавляем кнопку Clear All в начало
        const clearAllBtn = document.createElement('button');
        clearAllBtn.className = 'btn btn-danger mb-3';
        clearAllBtn.textContent = 'Clear All';
        clearAllBtn.addEventListener('click', clearAllCart);
        cartDiv.appendChild(clearAllBtn);

        // Отображаем интерфейс корзины, даже если пуста
        const categories = [...new Set(items.map(i => i.category_name))];
        
        categories.forEach(category => {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'mb-3';
            
            // Создаем контейнер для заголовка и кнопки
            const headerContainer = document.createElement('div');
            headerContainer.className = 'd-flex justify-content-between align-items-center mb-2';
            
            // Заголовок категории
            const categoryHeader = document.createElement('h4');
            categoryHeader.textContent = category;
            headerContainer.appendChild(categoryHeader);
            
            // Кнопка Clear для категории
            const clearBtn = document.createElement('button');
            clearBtn.className = 'btn btn-sm btn-secondary';
            clearBtn.textContent = 'Clear';
            clearBtn.addEventListener('click', () => clearCategoryCart(category));
            headerContainer.appendChild(clearBtn);
            
            categoryDiv.appendChild(headerContainer);
            
            const itemsInCategory = cart.filter(i => i.category_name === category);
            
            // Создаем контейнер для предметов
            const row = document.createElement('div');
            row.className = 'd-flex flex-wrap gap-2';
            categoryDiv.appendChild(row);

            // Добавляем предметы если они есть
            if (itemsInCategory.length > 0) {
                itemsInCategory.forEach(item => {
                    const card = document.createElement('div');
                    card.className = 'cart-item';
                    card.innerHTML = `<img src="${item.iconUrl}" alt="${item.name}">`;
                    row.appendChild(card);

                    card.addEventListener('click', () => removeFromCart(item.cartId));
                });
            } else {
                const noItems = document.createElement('p');
                noItems.textContent = 'No items';
                categoryDiv.appendChild(noItems);
            }
            
            cartDiv.appendChild(categoryDiv);
        });

        calculateCart();
    }

    // Функция для очистки всей корзины
    function clearAllCart() {
        cart = [];
        renderCart();
    }

    // Функция для очистки категории
    function clearCategoryCart(category) {
        cart = cart.filter(item => item.category_name !== category);
        renderCart();
    }

    // Добавляем функцию для подсчета материалов
    function calculateTotalMaterials() {
        const materialCount = {};

        cart.forEach(item => {
            item.materials.forEach(material => {
                const materialId = material.id;
                if (!materialCount[materialId]) {
                    materialCount[materialId] = {
                        name: material.name,
                        iconUrl: material.iconUrl,
                        quantity: 0
                    };
                }
                materialCount[materialId].quantity += material.quantity;
            });
        });

        return materialCount;
    }

    // Обновляем функцию calculateCart
    function calculateCart() {
        const materialCount = calculateTotalMaterials();
        
        // Группируем предметы по категориям
        const categories = [...new Set(items.map(i => i.category_name))];
        const itemsByCategory = {};
        
        categories.forEach(category => {
            itemsByCategory[category] = cart.filter(i => i.category_name === category);
        });
        
        // Находим максимальное время производства среди всех категорий
        let maxCategoryTime = 0;
        for (const [category, items] of Object.entries(itemsByCategory)) {
            let categoryTime = 0;
            items.forEach(item => {
                categoryTime += item.production_time_seconds;
            });
            maxCategoryTime = Math.max(maxCategoryTime, categoryTime);
        }
        
        // Обновляем отображение
        const cartDiv = document.getElementById('cart');
        
        // Удаляем предыдущий summary если есть
        const existingSummary = cartDiv.querySelector('.cart-summary');
        if (existingSummary) {
            existingSummary.remove();
        }

        // Создаем новый summary
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'cart-summary';
        
        // Добавляем время - теперь используем максимальное время по категориям
        summaryDiv.innerHTML += `<p>Total Time: ${maxCategoryTime} sec</p>`;
        
        // Добавляем материалы
        let materialsHTML = '<h4>Total Materials:</h4><ul class="materials-list">';
        Object.values(materialCount).forEach(material => {
            materialsHTML += `
                <li class="material-item">
                    <img src="${material.iconUrl}" alt="${material.name}" class="material-icon">
                    <span>${material.name}: ${material.quantity}</span>
                </li>
            `;
        });
        materialsHTML += '</ul>';
        
        summaryDiv.innerHTML += materialsHTML;
        cartDiv.appendChild(summaryDiv);
    }

    renderCart();
});