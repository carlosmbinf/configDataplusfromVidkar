'use strict';

var _ = require('underscore');

// Función para dividir la salida en bloques por dispositivo
function breakIntoBlocks(fullText) {
  var blocks = [];
  var lines = fullText.split('\n');
  var currentBlock = [];

  lines.forEach(function(line) {
    if (line.trim() === '') {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
    } else {
      currentBlock.push(line);
    }
  });

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  return blocks;
}

// Función para parsear un solo bloque de salida de ip -s link show
function parseSingleBlock(block) {
  var data = {
    device: '',
    inet: {},
    inet6: {},
    link: {},
    rx: { packets: 0, bytes: 0 },
    tx: { packets: 0, bytes: 0 },
    other: {}
  };

  block.forEach(function(line, index) {
    line = line.trim();

    // Primera línea: "2: ens192: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 ..."
    var matchDevice = line.match(/^\d+: (\S+):/);
    if (matchDevice) {
      data.device = matchDevice[1];
      return;
    }

    // Línea que contiene "link/ether 00:50:56:bb:b4:58 ..."
    var matchHwaddr = line.match(/^link\/\S+ (\S+)/);
    if (matchHwaddr) {
      data.link.hwaddr = matchHwaddr[1];
      return;
    }

    // RX: (aquí vienen 2 líneas, paquetes y bytes)
    if (line.startsWith('RX:')) {
      // La siguiente línea contiene stats
      var statsLine = block[index + 1] || '';
      var stats = statsLine.trim().split(/\s+/);

      // stats[0]: packets, stats[1]: errors, stats[2]: dropped, stats[3]: overrun, stats[4]: frame
      data.rx.packets = parseInt(stats[0]) || 0;
      data.rx.bytes = parseInt(stats[4]) || 0;  // Ojo que el orden bytes varía, normalmente está separado en la siguiente línea
      return;
    }

    // TX:
    if (line.startsWith('TX:')) {
      var statsLine = block[index + 1] || '';
      var stats = statsLine.trim().split(/\s+/);

      data.tx.packets = parseInt(stats[0]) || 0;
      data.tx.bytes = parseInt(stats[4]) || 0;
      return;
    }

    // inet y inet6 no están en ip -s link show, se obtienen con "ip addr show"
    // Por eso, para inet e inet6, habría que hacer un parser aparte (o combinarlos).

  });

  return data;
}

// Parser principal
function parser(fullText) {
  var blocks = breakIntoBlocks(fullText);
  var map = {};

  _.each(blocks, function(block) {
    var obj = parseSingleBlock(block);
    if (obj.device) {
      // Inicializamos inet e inet6 en null si están vacíos para que tengan la estructura que quieres
      if (Object.keys(obj.inet).length === 0) obj.inet = null;
      if (Object.keys(obj.inet6).length === 0) obj.inet6 = null;
      if (Object.keys(obj.link).length === 0) obj.link = null;

      map[obj.device] = obj;
    }
  });

  return map;
}

module.exports = parser;
