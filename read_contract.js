const ethers = require('ethers');
const readline = require('readline');
const AbiCoder = ethers.utils.AbiCoder;
const { exit } = require('process');

const chain_rpc = {
    "eth":"https://ethereum.publicnode.com",
    "bsc":"https://bsc-dataseed.binance.org",
    "matic":"https://polygon-rpc.com",
    "cro":"https://evm.cronos.org",
    "avax":"https://api.avax.network/ext/bc/C/rpc",
    "metis":"https://andromeda.metis.io/?owner=1088",
    "milk":"https://rpc-mainnet-cardano-evm.c1.milkomeda.com"
}

var wsProvider = undefined;
var coder = undefined;

var contract_call = '';
var method = '';
var parameters_types = [];
var parameters = [];
var encoded_request = undefined;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const initialize = async () => {
    if(true){
        await run();
    }
    exit();
};

const run = async () => {
    try
    {
        return new Promise(resolve => { _process(); });    
    }
    catch (err)
    {
        console.log(err.toString());        
    }
};

const _process = async () => {

        try
        {
            await stepGetProvider();
        }
        catch (err)
        {
            console.log(err.toString());        
        }
};

//STEPS//////////////////////////////////////////////////////////////

const stepGetProvider = async () => {
    wsProvider = undefined;
    rl.question('\nIntroduce chain ("eth", "bsc", "matic", "cro", "avax", "metis", "milk") or RPC provider (only EVM based blockchains)\n', async (chain) => {
        if(chain_rpc[chain] != undefined || chain.startsWith("https://")){
            try{
                wsProvider = new ethers.providers.JsonRpcProvider(chain_rpc[chain] != undefined ? chain_rpc[chain] : chain);                     
                console.log(`\nConnection data:`);
                await Promise.all([
                    wsProvider.getNetwork().then((_network) => {
                        console.log(`Chain id: ${_network.chainId}`);
                    }),
                    wsProvider.getBlock().then((_block) => {
                        console.log(`Block number: ${_block.number}\nTimestamp: ${_block.timestamp} seconds`);
                    }),
                    wsProvider.getGasPrice().then((_gasPrice) => {
                        console.log(`Gas price: ${ethers.utils.formatUnits(_gasPrice, "gwei")} gwei`);
                    }),                        
                ]);        
                console.log(`\n`);                                          
            }
            catch(err){
                console.log(`Chain or RPC not supported (${chain}), error: ${err.toString()}`);
                await stepGetProvider();
            }
            await stepGetContract();
        }
        else{
            console.log(`\nChain not supported (${chain})\n`);
            await stepGetProvider();
        }
    });
}

const stepGetContract = async () => {
    rl.question('\nIntroduce contract\n', async (contract) => {
        try{
            contract_call = ethers.utils.getAddress(contract);
            await stepGetMethod();
        }
        catch(err){
            console.log(`\nInvalid contract address ${contract}\n`);
            //console.log(err.toString());
            await stepGetContract();
        }
    });
}

const stepGetMethod = async () => {
    rl.question('\nIntroduce method, formats allowed: methodName/unknownMethodID/0xMethodID(uint256,address)\n', async (methodName) => {
        method = methodName + '';
        //Encode method or correct name
        if(method.indexOf('0x') >= 0 || method.indexOf('unknown') >= 0){
            method = method.replace('0x', '').replace('unknown', '');
            coder = undefined;
        }
        else{
            coder = new ethers.utils.AbiCoder();
        }

        //Parameters types
        parameters_types = method.split('(')[1].split(')')[0].split(',');
        if(parameters_types == undefined || (parameters_types.length == 1 && parameters_types[0] == '')){
            parameters_types = [];
        }

        await stepGetParameters();
    });
}

const stepGetParameters = async () => {
    parameters = [];
    rl.question(`\nIntroduce your ${parameters_types.length - parameters.length} parameters separated by ";"\n`, async (parameters_objs) => {
        parameters = parameters_objs.split(';');
        if(parameters == ''){
            parameters = [];
        }                                 
        await stepGetOutputs();
    });
}

const stepGetOutputs = async () => {
    rl.question(`\nIntroduce the output parameters types separated by ";" (uint256, address, bool, string...)\n`, async (parameters_objs) => {
        output_parameters = parameters_objs.split(';');                                 
        await stepPerformRequest();
    });
}

const stepPerformRequest = async () => {
    try
    {
        //Encode request
        if(coder == undefined){
            coder = new ethers.utils.AbiCoder();
            encoded_request = '0x' + method.split('(')[0] + coder.encode(parameters_types, parameters).toString().substring(2);
        }
        else{
            let ABI = ['function ' + (await parseEthersAbiFormat(method, parameters_types))];
            let iface = new ethers.utils.Interface(ABI);
            encoded_request = iface.encodeFunctionData(method.split('(')[0], parameters);
        }
        console.log(`\nEncoded request: ${encoded_request}`);                        

        var answer = await wsProvider.call({
            'to': contract_call,
            'data': encoded_request
        }); 
        console.log(`Answer: ${answer}`);
        let decoded = await decodeParams(output_parameters, answer, true); 
        console.log(`\nDecoded answer: ${decoded}`);
    }
    catch(err)
    {
        console.log('ERROR');
        console.log(err.toString());
    }
    await stepFinish();
}

const stepFinish = async () => {
    await stepGetMethod();
}

/////////////////////////////////////////////////////////////////////

async function decodeParams(types, output, ignoreMethodHash) {

    if (!output || typeof output === 'boolean') {
        ignoreMethodHash = output;
        output = types;
    }

    if (ignoreMethodHash && output.replace(/^0x/, '').length % 64 === 8)
        output = '0x' + output.replace(/^0x/, '').substring(8);

    const abiCoder = new AbiCoder();

    if (output.replace(/^0x/, '').length % 64)
        throw new Error('The encoded string is not valid. Its length must be a multiple of 64.');
    return abiCoder.decode(types, output).reduce((obj, arg, index) => {
        if (types[index] == 'address')
            arg = ADDRESS_PREFIX + arg.substr(2).toLowerCase();
        obj.push(arg);
        return obj;
    }, []);
}

async function parseEthersAbiFormat(method, parameters_types){
    var array_replaces = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
    var index = 0;

    for(var index in parameters_types){
        method = method.replace(parameters_types[index], parameters_types[index] + ' ' + array_replaces[index]);
    }

    return method;
}

(async() => {
    initialize();
})();