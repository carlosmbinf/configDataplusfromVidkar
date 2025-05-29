'use strict';

function parseIpLinkShowStats(text) {
  const interfaces = {};
  let currentInterface = null;
  let waitingForRx = false;
  let waitingForTx = false;

  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Nueva interfaz
    const ifaceMatch = line.match(/^\d+: ([\w@:.\-]+):/);
    if (ifaceMatch) {
      currentInterface = ifaceMatch[1];
      interfaces[currentInterface] = {
        device: currentInterface,
        rx: { packets: 0, bytes: 0 },
        tx: { packets: 0, bytes: 0 },
        link: {},
        other: {}
      };
      waitingForRx = false;
      waitingForTx = false;
      continue;
    }

    if (!currentInterface) continue;

    // MAC address
    const linkMatch = line.match(/^link\/\S+ (\S+)/);
    if (linkMatch) {
      interfaces[currentInterface].link.hwaddr = linkMatch[1];
      continue;
    }

    // RX/TX headers
    if (line.startsWith('RX:')) {
      waitingForRx = true;
      waitingForTx = false;
      continue;
    } else if (line.startsWith('TX:')) {
      waitingForRx = false;
      waitingForTx = true;
      continue;
    }

    // RX/TX valores
    const dataMatch = line.match(/^(\d+)\s+(\d+)/);
    if (dataMatch) {
      const bytes = parseInt(dataMatch[1], 10);
      const packets = parseInt(dataMatch[2], 10);

      if (waitingForRx) {
        interfaces[currentInterface].rx = { packets, bytes };
        waitingForRx = false;
      } else if (waitingForTx) {
        interfaces[currentInterface].tx = { packets, bytes };
        waitingForTx = false;
      }
    }
  }

  return interfaces;
}

module.exports = parseIpLinkShowStats;
