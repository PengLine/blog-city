document.addEventListener('DOMContentLoaded', function() {
    initModuleNavigation();
    initTabNavigation();
    initPageTransition();
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
        const textContent = value.textContent.trim();
        if (textContent === '智能' || textContent.includes('%') || textContent.includes('m') || textContent.includes('分钟')) {
            return;
        }
        
        const target = parseInt(textContent.replace(/,/g, ''));
        if (isNaN(target)) return;
        
        let current = 0;
        const increment = target / 50;
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                value.textContent = formatNumber(target);
                clearInterval(timer);
            } else {
                value.textContent = formatNumber(Math.floor(current));
            }
        }, 30);
    });
}

function formatNumber(num) {
    return num.toLocaleString();
}

function initAnimatedNumbers() {
    setTimeout(animateNumbers, 500);
}

function initChart(canvasId, type, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    
    const ctx = canvas.getContext('2d');
    
    const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: '#8892b0',
                    padding: 20
                }
            }
        }
    };
    
    return new Chart(ctx, {
        type: type,
        data: data,
        options: { ...defaultOptions, ...options }
    });
}

function createBarChartData(labels, datasets) {
    return {
        labels: labels,
        datasets: datasets.map(ds => ({
            ...ds,
            backgroundColor: ds.backgroundColor || 'rgba(52, 152, 219, 0.8)',
            borderColor: ds.borderColor || 'rgba(52, 152, 219, 1)',
            borderWidth: 1
        }))
    };
}

function createPieChartData(labels, data, colors) {
    return {
        labels: labels,
        datasets: [{
            data: data,
            backgroundColor: colors || [
                'rgba(231, 76, 60, 0.8)',
                'rgba(52, 152, 219, 0.8)',
                'rgba(243, 156, 18, 0.8)',
                'rgba(39, 174, 96, 0.8)',
                'rgba(155, 89, 182, 0.8)'
            ],
            borderWidth: 0
        }]
    };
}

function createLineChartData(labels, datasets) {
    return {
        labels: labels,
        datasets: datasets.map(ds => ({
            ...ds,
            backgroundColor: ds.backgroundColor || 'rgba(0, 212, 255, 0.1)',
            borderColor: ds.borderColor || 'rgba(0, 212, 255, 1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
        }))
    };
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