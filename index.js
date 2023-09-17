const simpleDDP = require("simpleddp"); // nodejs
const ws = require("isomorphic-ws");
var cron = require("node-cron");
var fs = require("fs");

let opts = {
    endpoint: "ws://vidkar.ddns.net:6000/websocket",
    SocketConstructor: ws,
    reconnectInterval: 10000,
};
var server = new simpleDDP(opts);




/////LISTA DE MEGAS CONSUMIDOS POR USUARIOS
var consumos = {}

/////LISTA DE USUARIOS CONECTADOS
var listadeclientesconectados = []


server.on('connected', async () => {
    // do something
    console.log("Conectado");
    

    //////poniendo a todos en ofline para poner solo los conectados en online
    let user = (await server.call('getusers', { vpn: true }))
    await user.map(elemento => server.call('setOnlineVPN', elemento._id, { "vpnplusConnected": false }))
    
});

server.on('disconnected', () => {
    // for example show alert to user
    console.info("Desconectado");
});

server.on('error', (e) => {
    // global errors from server
    console.error(e);
});


cron
    .schedule(
        "*/20 0-59 0-23 1-31 1-12 *",
        async () => {
            server.connected ? 
               ejecutar()
            
            : server.connect()
        },
        {
            scheduled: true,
            timezone: "America/Havana",
        }
    )
    .start();

ejecutar = async () => {
        try {


            let userSub = server.subscribe("user",{vpnip:2});
            await userSub.ready();
            ////!!!aqui se actualiza LOS MEGAS PARA VIDKAR!!!
            
    
        /////TAREA DE 10 SEGUNDOS
        console.log('EJECUTANDO');
    
        /////DEVOLVER RESULTADO DE IFCONFIG
        require('ifconfig-linux')().then(async (element) => {
    
            ///////creando variables para listar los usuarios que tienen VPN2MB
            let result = ""
            let usuariosVPN = await server.call('getusers', { "vpn2mb": true, "vpn": true });
            
            await usuariosVPN.forEach((usuarioVPN, index) => {
                result = usuarioVPN.username ? `${result}${usuarioVPN.username} l2tpd ${usuarioVPN.passvpn ? usuarioVPN.passvpn : "123"} ${usuarioVPN.vpnip ? '192.168.18.' + usuarioVPN.vpnip : "*"}\n` : result
            });
            await console.log(result);

            ////////GUARDANDO PARA EL ARCHIVO OPTIONS LOS USUARIOS CON EL SERVICIO
            await fs.writeFile("/etc/ppp/chap-secrets", result, (err) => {
                if (err) console.error("Error: " + err);
                console.info("Datos Guardados Correctamente!!!")
            });





            /////LISTA LAS INTERFACES
            let listInterfaces = Object.keys(element)
    
            /////SELECCIONA LAS INTERFACES CON PPP
            let ppp = listInterfaces.filter(interface => interface.includes("ppp"))
            //////RECORRE TODAS LAS INTERFACES


            
              
                
            ppp.map(async (elementppp) => {
               await console.log(`elemento ${elementppp}: ` + JSON.stringify(element[elementppp]))
                ///////SELECCIONA LA IP DEL CLIENTE
                let cliente =  element[elementppp].inet.destination
    
                //////MEGAS GASTADOS
                let megasGastados =  element[elementppp].tx.bytes 
    
                /////LISTA LOS CONECTADOS PARA COMPARARLOS CON EL REGISTRO DE MEGAS PARA SABER CUAL SE DESCONECTO
                listadeclientesconectados.push(cliente)

                console.log( cliente)
                ///////SUMANDOLE EL CONSUMO AL USUARIO
                let ip = cliente.split(".")[3]
                let user = (await server.call('getusers', { vpnip: Number(ip) }))[0]
                await server.call('setOnlineVPN', user._id, {
                    vpnMbGastados: user.vpnMbGastados ?
                        (consumos[cliente]
                            ? (user.vpnMbGastados + (megasGastados - consumos[cliente]))
                            : user.vpnMbGastados + megasGastados)
                        : consumos[cliente]
                })

                ////// CONECTANDO EL USUARIO EN VIDKAR
                await server.call('setOnlineVPN', user._id, { "vpnplusConnected": true })
    
                console.log(`CLIENTE: ${cliente} gasto: ${megasGastados/ 1000000}`);
                consumos[cliente] = megasGastados



            })
    
            ////////DEVUELVE LA IP DE LOS DESCONECTADOS
            let array1 = Object.keys(consumos).filter(function (val) {
                return listadeclientesconectados.indexOf(val.toString()) == -1;
            });
    
            console.log(consumos);
    
            console.log("DESCONECTADOS: " + array1);
            ////// QUITA LOS USUARIOS DESCONECTADOS Y ACTUALIZA LOS MEGAS EN VIDKAR
            array1.length > 0 && (
                array1.map(async (a) => {
                    let ip = await a.split(".")[3]
                    let user = (await server.call('getusers', { vpnip: Number(ip) }))[0]

                    /////eliminando usuario del arreglo de los conectados
                    delete consumos[a]

                    /////desconectando usuario en VIDKAR
                    await server.call('setOnlineVPN', user._id, { "vpnplusConnected": false })



                })
            )
    
            //limpia cache de conectados
            listadeclientesconectados = []
    

        });
    
            // server.call('setOnlineVPN', user._id, { "vpnplusConnected": disponible })
    
        } catch (error) {
            console.error(error);
        }
    }



// const simpleDDP = require("simpleddp"); // nodejs
// const ws = require("isomorphic-ws");
// var cron = require("node-cron");

// var fs = require("fs");
// var tcpp = require('tcp-ping');
// let opts = {
//     endpoint: "ws://vidkar.sytes.net:6000/websocket",
//     SocketConstructor: ws,
//     reconnectInterval: 10000,
// };
// const server = new simpleDDP(opts);

// server.on('connected', async () => {
//     // do something
//     console.log("Conectado");
//     try {

//         // let userSub = server.subscribe("user");
//         // await userSub.ready();
//         let result = ""
//         let usuariosVPN = await server.call('getusers', { "vpn2mb": true, "vpn": true });

//         await usuariosVPN.map(async (user) => {

//             let disponible = false
//             try {
//                 await tcpp.probe(`192.168.18.${user.vpnip}`, 135, async function (err, available) {
//                     err && console.error(err)
//                     disponible = available;
//                     server.call('setOnlineVPN', user._id, { "vpnplusConnected": disponible })
// 		console.log(`192.168.18.${user.vpnip} ${user.username} conected: ${disponible}`)
//                     // server.call.(user._id, {
//                     //   $set: { vpnConnected: disponible }
//                     // })

//                 })
//             } catch (error) {
//                 console.error(error)
//             }
//         })




//         //    await server.collection('users').filter(user => user.vpn == true).fetch()

//         await usuariosVPN.forEach((element, index) => {
//             result = element.username ? `${result}${element.username} l2tpd ${element.passvpn ? element.passvpn : "123"} ${element.vpnip ? '192.168.18.' + element.vpnip : "*"}\n` : result
//         });
//         await console.log(result);
//         // server.disconnect()

//         await fs.writeFile("/etc/ppp/chap-secrets", result, (err) => {
//             if (err) console.error("Error: " + err);
//             console.info("Datos Guardados Correctamente!!!")
//         });


//         await server.disconnect()
//     } catch (error) {
//         console.error(error);
//     }


// });

// server.on('disconnected', () => {
//     // for example show alert to user
//     console.info("Desconectado");
// });

// server.on('error', (e) => {
//     // global errors from server
//     console.error(e);
// });


// cron
//     .schedule(
//         "*/20 0-59 0-23 1-31 1-12 *",
//         async () => {
//             server.connect()
//         },
//         {
//             scheduled: true,
//             timezone: "America/Havana",
//         }
//     )
//     .start();
