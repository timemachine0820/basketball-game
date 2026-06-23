const Modal = {
  show(title, contentHtml, options) {
    let mask = document.getElementById('globalModalMask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'globalModalMask';
      mask.className = 'modal-mask';
      document.body.appendChild(mask);
    }
    const closeBtn = options && options.hideClose ? '' : '<button class="pixel-btn" onclick="Modal.hide()" style="margin-top:0.5rem;">关闭</button>';
    mask.innerHTML = `
      <div class="modal-panel pixel-border">
        <div class="modal-title">${title}</div>
        <div class="modal-body">${contentHtml}</div>
        ${closeBtn}
      </div>
    `;
    mask.style.display = 'flex';
  },

  hide() {
    const mask = document.getElementById('globalModalMask');
    if (mask) mask.style.display = 'none';
  },

  confirm(title, message, onConfirm) {
    this.show(title, `<p style="margin-bottom:0.5rem;">${message}</p>`, { hideClose: true });
    const mask = document.getElementById('globalModalMask');
    const body = mask.querySelector('.modal-body');
    body.innerHTML += `
      <div style="display:flex;gap:0.3rem;">
        <button class="pixel-btn primary" style="flex:1;" id="modalConfirmBtn">确认</button>
        <button class="pixel-btn" style="flex:1;" onclick="Modal.hide()">取消</button>
      </div>
    `;
    document.getElementById('modalConfirmBtn').addEventListener('click', () => {
      Modal.hide();
      if (onConfirm) onConfirm();
    });
  }
};