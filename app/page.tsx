async function getPrices() {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd",
    { cache: "no-store" }
  );
  return res.json();
}

async function getAI(price: number) {
  const res = await fetch("http://localhost:3000/api/ai", {
    method: "POST",
    body: JSON.stringify({ price }),
  });

  const data = await res.json();
  return data.data; // 
}


export default async function Home() {
  const data = await getPrices();

const [btcAI, ethAI] = await Promise.all([
  getAI(data.bitcoin.usd),
  getAI(data.ethereum.usd),
]);

  return (
    <div className="bg-black text-white min-h-screen p-6">
      <h1 className="text-3xl mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4">
        {[{ name: "Bitcoin", data: data.bitcoin, ai: btcAI },
          { name: "Ethereum", data: data.ethereum, ai: ethAI }].map((item, i) => {

          const sentiment = String(item.ai?.sentiment || "Neutral");

const color =
  sentiment.includes("Alcista") ? "text-green-400" :
sentiment.includes("Bajista") ? "text-red-400" :
"text-yellow-400";
          return (
            <div key={i} className="bg-gray-900 p-4 rounded-xl shadow-lg">
              <h2 className="text-lg font-bold">{item.name}</h2>
              <p className="text-2xl">${item.data.usd}</p>

              <p className={`mt-2 font-bold ${color}`}>
  {String(item.ai?.sentiment)}
</p>

              <p className="text-sm text-gray-400">
  {String(item.ai?.reason)}
</p>

              <div className="mt-3">
                <div className="w-full bg-gray-700 h-2 rounded">
                  <div
                    className="bg-green-400 h-2 rounded"
                    style={{ width: `${Number(item.ai?.confidence || 50)}%` }}
                  ></div>
                </div>
                <p className="text-xs mt-1">
                  Confidence {Number(item.ai?.confidence || 50)}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}