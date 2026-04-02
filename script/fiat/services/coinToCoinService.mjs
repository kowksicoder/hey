export const createCoinToCoinService = () => {
  const notImplemented = (message) => ({
    payload: {
      error: "coin_to_coin_not_ready",
      message,
      success: false
    },
    statusCode: 501
  });

  return {
    execute: async () =>
      notImplemented(
        "Coin-to-coin swaps are not enabled yet. TODO: wire this to the live Zora trade path once the Every1 swap contract is ready."
      ),
    quote: async () =>
      notImplemented(
        "Coin-to-coin quotes are not enabled yet. TODO: add source-balance validation and live target quote generation."
      )
  };
};
