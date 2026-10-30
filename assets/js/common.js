document.addEventListener('DOMContentLoaded', function() {
    initModuleNavigation();
    initTabNavigation();
    initPageTransition();
    // 数字滚动动画此前只在首页手动触发，这里统一交给所有页面
    initAnimatedNumbers();
});

function initModuleNavigation() {
    const moduleButtons = document.querySelectorAll('.module-btn');
    const moduleContents = document.querySelectorAll('.module-content');

    moduleButtons.forEach(button => {
        button.addEventListener('click', function() {
            const moduleId = this.getAttribute('data-module');
            
            moduleButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            moduleContents.forEach(content => content.classList.remove('active'));
            const targetContent = document.getElementById(`${moduleId}-module`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

function initTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            const moduleContent = this.closest('.module-content');
            
            if (!moduleContent) return;

            const moduleButtons = moduleContent.querySelectorAll('.tab-btn');
            const tabContents = moduleContent.querySelectorAll('.tab-content');

            moduleButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            tabContents.forEach(content => content.classList.remove('active'));
            const targetTab = moduleContent.querySelector(`#${tabId}-tab`);
            if (targetTab) {
                targetTab.classList.add('active');
            }
        });
    });
}

function initPageTransition() {
    const navItems = document.querySelectorAll('.nav-item, .nav-btn');
    
    navItems.forEach(item => {
        if (item.tagName === 'A' && item.getAttribute('href')) {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                const href = this.getAttribute('href');
                document.body.style.opacity = '0';
                document.body.style.transition = 'opacity 0.3s ease';
                setTimeout(() => {
                    window.location.href = href;
                }, 300);
            });
        }
    });
}

function animateNumbers() {
    const statValues = document.querySelectorAll('.stat-value, .metric-value');
    statValues.forEach(value => {
        if (value.dataset.animated === '1') return;
        const textContent = value.textContent.trim();
        // 拆出「前缀 + 数值 + 后缀」，避免 4.8 被取整成 4、10TB 被削成 10
        const matched = textContent.match(/^([^\d]*)(\d[\d,]*(?:\.\d+)?)(.*)$/);
        if (!matched) return;

        const prefix = matched[1];
        const decimals = matched[2].includes('.') ? matched[2].split('.')[1].length : 0;
        const suffix = matched[3];
        const target = parseFloat(matched[2].replace(/,/g, ''));
        if (!isFinite(target)) return;

        value.dataset.animated = '1';
        let current = 0;
        const increment = target / 50;
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                value.textContent = prefix + formatNumber(target, decimals) + suffix;
                clearInterval(timer);
            } else {
                value.textContent = prefix + formatNumber(current, decimals) + suffix;
            }
        }, 30);
    });
}

function formatNumber(num, decimals = 0) {
    return Number(num).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function initAnimatedNumbers() {
    setTimeout(animateNumbers, 500);
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function refreshData() {
    const loadingIndicator = document.createElement('div');
    loadingIndicator.textContent = '正在刷新数据...';
    loadingIndicator.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 20px 40px;
        border-radius: 10px;
        z-index: 9999;
    `;
    document.body.appendChild(loadingIndicator);
    
    setTimeout(() => {
        location.reload();
    }, 1000);
}