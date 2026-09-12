(function () {
  const token = location.pathname.split('/').filter(Boolean).pop();
  const btn = document.getElementById('claimBtn');
  const status = document.getElementById('claimStatus');
  const nameEl = document.getElementById('claimName');
  const symbolEl = document.getElementById('claimSymbol');
  const logoEl = document.getElementById('claimLogo');

  let claimData = null;
  let polling = false;

  function setStatus(text, kind) {
    status.textContent = text || '';
    status.className = `claim-status${kind ? ` ${kind}` : ''}`;
  }

  function setButton(text, disabled) {
    btn.textContent = text;
    btn.disabled = Boolean(disabled);
  }

  function renderDraft(draft) {
    if (!draft) return;
    nameEl.textContent = draft.name || 'Your token';
    symbolEl.textContent = draft.symbol ? `$${draft.symbol}` : '';
    if (draft.logo) logoEl.src = draft.logo;
  }

  function showExplorerLink(url) {
    const existing = document.getElementById('claimExplorerLink');
    if (existing) existing.remove();
    const a = document.createElement('a');
    a.id = 'claimExplorerLink';
    a.className = 'claim-link';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.textContent = url;
    status.insertAdjacentElement('afterend', a);
  }

  async function loadClaim() {
    const response = await fetch(`/api/claim/${token}`, { cache: 'no-store' });
    const data = await response.json();
    claimData = data;
    renderDraft(data.draft);

    if (data.status === 'confirmed') {
      setStatus('Your token is live.', 'success');
      showExplorerLink(data.explorerUrl);
      setButton('Launched', true);
      return;
    }
    if (data.status === 'failed') {
      setStatus(`Launch failed: ${data.error || 'unknown error'}`, 'error');
      setButton('Launch failed', true);
      return;
    }
    if (data.status === 'expired' || response.status === 410) {
      setStatus('This link has expired. Text LAUNCH to start again.', 'error');
      setButton('Link expired', true);
      return;
    }
    if (!data.ok) {
      setStatus(data.error || 'Could not load this launch.', 'error');
      setButton('Unavailable', true);
      return;
    }
    setStatus('');
    setButton('Connect wallet & launch', false);
  }

  async function ensureChain(provider) {
    const tx = claimData.tx;
    const currentChainId = await provider.request({ method: 'eth_chainId' });
    if (currentChainId === tx.chainIdHex) return;
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: tx.chainIdHex }] });
    } catch (error) {
      if (error && error.code === 4902) {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: tx.chainIdHex,
            chainName: tx.chainName,
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: [tx.rpcUrl],
            blockExplorerUrls: [tx.explorerUrl]
          }]
        });
      } else {
        throw error;
      }
    }
  }

  async function pollForConfirmation(txHash) {
    if (polling) return;
    polling = true;
    setStatus('Waiting for confirmation on Robinhood Chain…');
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      try {
        const response = await fetch(`/api/claim/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash })
        });
        const data = await response.json();
        if (data.status === 'confirmed') {
          setStatus('Your token is live.', 'success');
          showExplorerLink(data.explorerUrl);
          setButton('Launched', true);
          polling = false;
          return;
        }
        if (data.status === 'failed') {
          setStatus(`Launch failed: ${data.error || 'transaction reverted'}`, 'error');
          setButton('Launch failed', true);
          polling = false;
          return;
        }
      } catch {
        // keep polling through transient network errors
      }
    }
    polling = false;
    setStatus('Still waiting on the network. Your token will confirm shortly — you will also get a text.', null);
  }

  async function launch() {
    const provider = window.ethereum;
    if (!provider) {
      setStatus('No wallet found. Open this link in a wallet browser like MetaMask or Rabby.', 'error');
      return;
    }
    if (!claimData || !claimData.tx) {
      setStatus('Launch details are not ready yet.', 'error');
      return;
    }

    try {
      setButton('Connecting…', true);
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const from = accounts[0];
      await ensureChain(provider);

      setButton('Confirm in your wallet…', true);
      const tx = claimData.tx;
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from, to: tx.to, data: tx.data, value: tx.value }]
      });

      setButton('Submitted', true);
      fetch(`/api/claim/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash })
      }).catch(() => {});

      await pollForConfirmation(txHash);
    } catch (error) {
      setButton('Connect wallet & launch', false);
      setStatus(error && error.message ? error.message : 'Transaction was not sent.', 'error');
    }
  }

  btn.addEventListener('click', launch);
  loadClaim().catch(() => {
    setStatus('Could not load this launch link.', 'error');
    setButton('Unavailable', true);
  });
})();
