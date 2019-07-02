package ethclient

import "github.com/ethereum/go-ethereum/rpc"

func (cli *Client) RPCClient() *rpc.Client {
	return cli.c
}
