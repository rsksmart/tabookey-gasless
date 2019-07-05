package librelay

import (
	"context"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
)

// PendingCodeAt returns the contract code of the given account in the pending state.
func (cli *TbkClient) PendingCodeAt(ctx context.Context, account common.Address) ([]byte, error) {
	var result hexutil.Bytes
	err := cli.RPCClient().CallContext(ctx, &result, "eth_getCode", account, "latest")
	return result, err
}
