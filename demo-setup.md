# Demo Dapp with GSN setup guide

## Prerequisites

- A local RSK node running in regtest mode
- Docker

## Setup

All of the commands below must be run in the root directory.

1. Install the dependencies:

```
./dock/run.sh yarn
```

2. Configure truffle:

Run:

```
./dock/run.sh ip a
```

and look for the IP address of the container (e.g., `172.17.0.2`). Remember it. Then, run:

```
ip a
```

and look for the IP address of the host that corresponds to the docker container (usually on the network device `docker0`, e.g., `172.17.0.1`).

Edit the file `truffle.js`. Find the network entry that looks like this:

```
rsk: {
    verbose: process.env.VERBOSE,
    host: "172.17.0.1",
    port: 4444,
    network_id: "*",
}
```

Replace the `host` value with the IP address you found on the second `ip a` command. Replace the `port` value with your local node's JSON-RPC port (usually `4444`, so no need to change it in that case).

3. Check that truffle can access your RSK node:

Make sure your local RSK node is up and running. Then run:

```
./dock/run.sh npx truffle console --network rsk
```

When the prompt appears (`truffle(rsk)>`), run:

```
web3.eth.getBlockNumber()
```

you should get the current block number as a result.

## Running the demo

In the root directory, run:

```
./dock/run.sh ./start-demo.sh
```

After a while, you should get the following:

```
┌────────────────────────────────────────────────┐
│                                                │
│   Serving!                                     │
│                                                │
│   - Local:            http://localhost:5555    │
│   - On Your Network:  http://172.17.0.2:5555   │
│                                                │
└────────────────────────────────────────────────┘
```

To access the demo web app, click on the second link from the top (reason being the app is hosted on the docker container).

## Redeploying the contracts

In case you want to re-run the demo with a fresh set of contracts, run:

```
./dock/run.sh ./start-demo.sh reset
```

## Running the demo in development mode

In case you want to make changes to the app and be able to test them right away, run:

```
./dock/run.sh ./start-demo.sh dev
```

The app will automatically rebundle and refresh upon changes.
