'use strict';

function parseIpAddrShow(text) {
  const interfaces = {};
  let currentInterface = null;

  text.split('\n').forEach(line => {
    line = line.trim();

    // Comienza un nuevo bloque de interfaz
    const ifaceMatch = line.match(/^\d+: (\S+):/);
    if (ifaceMatch) {
      currentInterface = ifaceMatch[1];
      interfaces[currentInterface] = {
        device: currentInterface,
        inet: null,
        inet6: null,
        link: {},
        other: {}
      };
      return;
    }

    if (!currentInterface) return;

    // inet (IPv4)
    const inetMatch = line.match(/^inet (\d+\.\d+\.\d+\.\d+)(?:\/\d+)?(?: brd \d+\.\d+\.\d+\.\d+)?(?: scope \S+)?(?: (\S+))?/);
    if (inetMatch) {
      const ip = inetMatch[1];
      const scopeDev = inetMatch[2] || currentInterface;

      // Si es ppp, se busca IP del "peer"
      if (currentInterface.startsWith('ppp')) {
        const peerMatch = line.match(/peer (\d+\.\d+\.\d+\.\d+)/);
        if (peerMatch) {
          interfaces[currentInterface].inet = {
            addr: peerMatch[1],
            destination: ip
          };
        } else {
          interfaces[currentInterface].inet = { addr: ip };
        }
      } else {
        interfaces[currentInterface].inet = { addr: ip };
      }
      return;
    }

    // inet6 (IPv6)
    const inet6Match = line.match(/^inet6 ([a-fA-F0-9:]+)\/\d+ scope/);
    if (inet6Match) {
      interfaces[currentInterface].inet6 = { addr: inet6Match[1] };
      return;
    }

    // link (MAC)
    const linkMatch = line.match(/^link\/\S+ (\S+)/);
    if (linkMatch) {
      interfaces[currentInterface].link.hwaddr = linkMatch[1];
    }
  });

  return interfaces;
}

module.exports = parseIpAddrShow;
