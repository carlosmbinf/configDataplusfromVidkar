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



const ejecutarScript = async (script) => {
    var exec = require('child_process').exec;
    return new Promise(function (resolve, reject) {
        exec(script, function(error, stdout, stderr) {
            if (error) {
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    }).then((result) => {
        return console.log(result)
    });
};

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


        let userSub = server.subscribe("user", { vpnip: 2 });
        await userSub.ready();
        ////!!!aqui se actualiza LOS MEGAS PARA VIDKAR!!!


        /////TAREA DE 10 SEGUNDOS
        console.log('EJECUTANDO');

        /////DEVOLVER RESULTADO DE IFCONFIG
        var executeCmd = require('./ifconfig/ifconfig-linux/executeCmd');
        executeCmd().then(async (element) => {

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
            
            
            // si estado es PENTIENTE_A_REINICIAR 
            //ejecutarScript(`service ipsec restart`)
            //ejecutarScript(`service xl2tpd restart`)
            //actualizarEstadoServer: function (serverId, state)
            //getServer: function (ip)

            //  ipServer = 
            // const servidor = await server.call('getServer', "")
            // if(server.ip){

            // }

            /////SELECCIONA LAS INTERFACES DE SERVIDOR
            let interfaceServer = listInterfaces.filter(interface => interface.includes("ens"))
            let ipServer = interfaceServer && element[interfaceServer] && element[interfaceServer].inet && element[interfaceServer].inet.addr

            console.log("ipsServer",ipServer);
            let serverVPN = (await server.call('getServer', ipServer))

            if (serverVPN && serverVPN.estado == "PENDIENTE_A_REINICIAR" && serverVPN.idUserSolicitandoReinicio) {
                let idUserSolicitandoReinicio = serverVPN.idUserSolicitandoReinicio;
                await serverVPN.call('actualizarEstadoServer', serverVPN._id) //REINICIANDO VALOR A ACTIVO y idUserSolicitandoReinicio = null
                try {
                    await ejecutarScript(`service ipsec restart`)
                    await ejecutarScript(`service xl2tpd restart`)   
                    Meteor.call('registrarLog', 'REINICIAR SERVIDOR VPN', idUserSolicitandoReinicio, 'SERVER', 'Se Reinicio el Servidor VPN con IP: ' + ipServer)
                } catch (error) {
                    console.log('error',error)
                    Meteor.call('registrarLog', 'REINICIAR SERVIDOR VPN', idUserSolicitandoReinicio, 'SERVER', 'Se Reinicio el Servidor VPN con IP: ' + ipServer)
                }
            }

            
            let ppp = listInterfaces.filter(interface => interface.includes("ppp"))
            //////RECORRE TODAS LAS INTERFACES

            ppp.map(async (elementppp) => {
                try {
                    console.log(`elemento ${elementppp}: ` + JSON.stringify(element[elementppp]))
                    ///////SELECCIONA LA IP DEL CLIENTE
                    let cliente = element[elementppp].inet.destination

                    //////MEGAS GASTADOS
                    let megasGastados = element[elementppp].tx.bytes

                    /////LISTA LOS CONECTADOS PARA COMPARARLOS CON EL REGISTRO DE MEGAS PARA SABER CUAL SE DESCONECTO
                    

                    console.log(cliente)
                    ///////SUMANDOLE EL CONSUMO AL USUARIO
                    let ip = cliente.split(".")[3]
                    let user = (await server.call('getusers', { vpnip: Number(ip) }))[0]

                    //SI ESTA BLOQUEADO LA VPN LO DESCONECTA
                    if(user.vpn == false){
                        console.log("FORZANDO DESCONEXION DE USUARIO: " + user.username)
                        await ejecutarScript('ip link delete ' + elementppp);
                    }else{
                        listadeclientesconectados.push(cliente)
                        await server.call('setOnlineVPN', user._id, {
                            vpnMbGastados: user.vpnMbGastados ?
                                (consumos[cliente]
                                    ? (user.vpnMbGastados + (megasGastados - consumos[cliente]))
                                    : user.vpnMbGastados + megasGastados)
                                : consumos[cliente]
                        })
    
                        ////// CONECTANDO EL USUARIO EN VIDKAR
                        await server.call('setOnlineVPN', user._id, { "vpnplusConnected": true })
    
                        console.log(`CLIENTE: ${cliente} gasto: ${megasGastados / 1000000}`);
                        consumos[cliente] = megasGastados

                        
                    }

                    


                } catch (error) {
                    console.log(error)
                }



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


