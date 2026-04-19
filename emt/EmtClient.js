class EmtClient {
  static async fetchAllStops() {
    // Aquí iría la lógica para obtener todas las paradas
    // Por ejemplo, usando fetch para llamar a una API
    const response = await fetch("https://api.emt.com/stops");
    if (!response.ok) {
      throw new Error("Error fetching stops");
    }
    return await response.json();
  }
}

export default EmtClient;
