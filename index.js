const simpleDDP = require("simpleddp"); // nodejs
const ws = require("isomorphic-ws");
var cron = require("node-cron");
var fs = require("fs");

let opts = {
    endpoint: "ws://www.vidkar.com:6000/websocket",
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
            }else {
                if(stderr){
                resolve(stderr);
                }else{
                resolve(stdout);
                }
            }
        });
    }).then((result) => {
        return result
    });
};

/////LISTA DE MEGAS CONSUMIDOS POR USUARIOS
var consumos = {}

/////FLAG PARA SABER SI es valido que se ejecute el codigo/////
var validaEjecucion = false;

/////LISTA DE USUARIOS CONECTADOS
var listadeclientesconectados = []


server.on('connected', async () => {
    // do something
    console.log("Conectado");


    //////poniendo a todos en ofline para poner solo los conectados en online
    let user = (await server.call('getusers', { vpn: true },{ fields:{
        _id: 1,
        vpnip: 1,
        username: 1,
        vpnMbGastados: 1,
        vpnplusConnected: 1,
        vpn: 1,
        desconectarVPN: 1,
    },sort: { vpnip: 1 } }))
    console.log("USUARIOS: ", user);
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
        "0-59 0-23 1-31 1-12 *", //     */20 0-59 0-23 1-31 1-12 *
        async () => {
            if(server.connected){
                if(validaEjecucion == false){
                    await ejecutar();
                }else{
                    console.log("Se intento ejecutar pero ya esta en ejecucion el codigo");
                }
            }else{
                console.log("Intentando conectar nuevamente");
                server.connect()
            }
        },
        {
            scheduled: true,
            timezone: "America/Havana",
        }
    )
    .start();

ejecutar = async () => {
    try {
        validaEjecucion = true
        console.log("Ejecutando codigo de monitoreo de VPN FLAG: " + validaEjecucion);

        let userSub = await server.subscribe("user", { vpnip: 2 });
        await userSub.ready();
        ////!!!aqui se actualiza LOS MEGAS PARA VIDKAR!!!



        /////DEVOLVER RESULTADO DE IFCONFIG
        var executeCmd = await require('./ifconfig/ifconfig-linux/executeCmd');
        executeCmd().then(async (element) => {

            ///////creando variables para listar los usuarios que tienen VPN2MB
            let result = ""
            let usuariosVPN = await server.call('getusers', { "vpn2mb": true, "vpn": true },{ fields:{
                _id: 1,
                vpnip: 1,
                username: 1,
                vpnMbGastados: 1,
                vpnplusConnected: 1,
                vpn: 1,
                desconectarVPN: 1,
                passvpn:1
            },sort: { vpnip: 1 } });
            // console.log("usuariosVPN", usuariosVPN);
            await usuariosVPN.forEach((usuarioVPN, index) => {
                result = usuarioVPN.username ? `${result}${usuarioVPN.username} l2tpd ${usuarioVPN.passvpn ? usuarioVPN.passvpn : "123"} ${usuarioVPN.vpnip ? '192.168.18.' + usuarioVPN.vpnip : "*"}\n` : result
            });
            await console.log(result);

            ////////GUARDANDO PARA EL ARCHIVO OPTIONS LOS USUARIOS CON EL SERVICIO
            await fs.writeFile("/etc/ppp/chap-secrets", result, (err) => {
                if (err) console.error("Error: " + err);
                console.info("Datos Guardados Correctamente en el file de USUARIOS Y PASSS!!!")
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
            let interfaceServer = await listInterfaces.filter(interface => interface.includes("ens"))
            let ipServer = interfaceServer && element[interfaceServer] && element[interfaceServer].inet && element[interfaceServer].inet.addr

            console.log("ipsServer",ipServer);
            let serverVPN = (await server.call('getServer', ipServer))
            await server.call('actualizarEstadoServer', serverVPN._id,{lastUpdate:new Date()}) //REINICIANDO VALOR A ACTIVO y idUserSolicitandoReinicio = null
            
            if (serverVPN && serverVPN.estado == "PENDIENTE_A_REINICIAR" ) {

                if(!serverVPN.idUserSolicitandoReinicio){
                    console.log("idUserSolicitandoReinicio = null - SERVERVPN: ", serverVPN)
                    await server.call('actualizarEstadoServer', serverVPN._id) //REINICIANDO VALOR A ACTIVO y idUserSolicitandoReinicio = null
                    
                }else{
                    console.log("SERVERVPN: ", serverVPN)
                    let idUserSolicitandoReinicio = serverVPN.idUserSolicitandoReinicio;
                    await server.call('actualizarEstadoServer', serverVPN._id) //REINICIANDO VALOR A ACTIVO y idUserSolicitandoReinicio = null
                    let script = `service ipsec restart && service xl2tpd restart`
                    try {
                        
                        let returnScript = await ejecutarScript(script)
                        let mensaje = "Script ejecutado: " + script + "\nstdout: " + returnScript + "\nIP SERVER: " + ipServer;
                        console.log(mensaje);
                        server.call('registrarLog', 'Script ejecutado', idUserSolicitandoReinicio, 'SERVER', mensaje)
                    } catch (error) {
                        console.log('error',error)
                        server.call('registrarLog', 'ERROR Script ejecutado', idUserSolicitandoReinicio, 'SERVER', error)
                    }
                }
               
            }

            
            let ppp = await listInterfaces.filter(interface => interface.includes("ppp"))
            //////RECORRE TODAS LAS INTERFACES
            
            console.log("Se va a recorrer las interfaces para calcular lo gastado");
            //ppp.forEach cambiado a for para poder hacer un await
            for (let index = 0; index < ppp.length; index++) {
            
                const elementppp = ppp[index];
            
                try {
                    // console.log(`elemento ${elementppp}: ` + JSON.stringify(element[elementppp]))
                    ///////SELECCIONA LA IP DEL CLIENTE
                    let cliente = element[elementppp].inet.destination

                    //////MEGAS GASTADOS
                    let megasGastados = element[elementppp].tx.bytes

                    /////LISTA LOS CONECTADOS PARA COMPARARLOS CON EL REGISTRO DE MEGAS PARA SABER CUAL SE DESCONECTO
                    ///////SUMANDOLE EL CONSUMO AL USUARIO
                    let ip = cliente.split(".")[3]
                    let user = (await server.call('getusers', { vpnip: Number(ip) },{ fields:{
                        _id: 1,
                        vpnip: 1,
                        username: 1,
                        vpnMbGastados: 1,
                        vpnplusConnected: 1,
                        vpn: 1,
                        desconectarVPN: 1,
                    },sort: { vpnip: 1 } }))[0]

                    console.log("CONECTADO: ", user ? user.username + "-" + cliente : cliente);

                    //SI ESTA BLOQUEADO LA VPN LO DESCONECTA
                    if(user.vpn == false || user.desconectarVPN){
                        await server.call('updateUsersAll', user._id, { desconectarVPN: false })
                        console.log("FORZANDO DESCONEXION DE USUARIO: " + user.username)
                        await ejecutarScript('ip link delete ' + elementppp);
                    }else{
                        ///////SI EL USUARIO NO ESTA EN EL ARREGLO DE CONSUMOS LO AGREGA
                        listadeclientesconectados.push(cliente)

                        ///////Calcular consumo del usuario
                        let consumo = user.vpnMbGastados
                            ? (consumos[cliente]
                                ? (user.vpnMbGastados + (megasGastados - consumos[cliente]))
                                : user.vpnMbGastados + megasGastados)
                            : consumos[cliente]

                        await server.call('setOnlineVPN', user._id, {
                            vpnMbGastados: consumo,
                            "vpnplusConnected": true 
                        })
                        console.log(`CLIENTE: ${cliente}, Usuario: ${user.username} \nGasto desde su conexion: ${megasGastados / 1024000}\nGasto a sumar: ${(megasGastados-consumos[cliente])/1024000} \nGasto total: ${consumo / 1024000} MB`);
                        console.log("Se actualizo el usuario: " + user.username + " con " + consumo / 1024000 + " MB")
                        consumos[cliente] = megasGastados                        
                    }
                } catch (error) {
                    console.log(error)
                }
            
            }

            ////////DEVUELVE LA IP DE LOS DESCONECTADOS
            let array1 = await Object.keys(consumos).filter(function (val) {
                return listadeclientesconectados.indexOf(val.toString()) == -1;
            });

            ////// QUITA LOS USUARIOS DESCONECTADOS Y ACTUALIZA LOS MEGAS EN VIDKAR
            array1.length > 0 && (
               await array1.map(async (a) => {
                    await console.log("DESCONECTADO: " + a);
                    let ip = await a.split(".")[3]
                    let user = (await server.call('getusers', { vpnip: Number(ip) },{ fields:{
                        _id: 1,
                        vpnip: 1,
                        username: 1,
                        vpnMbGastados: 1,
                        vpnplusConnected: 1,
                        vpn: 1,
                        desconectarVPN: 1,
                        passvpn:1
                    },sort: { vpnip: 1 } }))[0]

                    /////eliminando usuario del arreglo de los conectados
                    delete consumos[a]

                    /////desconectando usuario en VIDKAR
                    await server.call('setOnlineVPN', user._id, { "vpnplusConnected": false })



                })
            )

            //limpia cache de conectados
            listadeclientesconectados = []

            // server.call('setOnlineVPN', user._id, { "vpnplusConnected": disponible })
            validaEjecucion = false
            console.log("Ejecucion finalizada FLAG: " + validaEjecucion);
        });

       

    } catch (error) {
        validaEjecucion = false
        console.log("Ejecucion finalizada FLAG: " + validaEjecucion + " en ERROR");
        console.error(error);
    }
}


