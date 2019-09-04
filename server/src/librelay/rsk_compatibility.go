package librelay

import (
	"net/http"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/rpc"
)

// Dial connects a client to the given URL
// IMPORTANT: for now we assume that we only use HTTP
func Dial(rawurl string, transport http.RoundTripper) (*ethclient.Client, error) {
	c, err := dialHTTP(rawurl, transport)
	if err != nil {
		return nil, err
	}
	return ethclient.NewClient(c), nil
}

// dialHTTP creates a new RPC client that connects to an RPC server over HTTP.
func dialHTTP(endpoint string, transport http.RoundTripper) (*rpc.Client, error) {
	cli := new(http.Client)
	cli.Transport = transport

	return rpc.DialHTTPWithClient(endpoint, cli)
}
