# TimeSeries Lab

TimeSeries Lab is a web application for real-time signal generation and forecasting. It allows users to visualize different types of time series data and apply forecasting models to predict future values.

## Features

*   **Real-time signal generation:**
    *   Sine wave
    *   Brownian motion
*   **Forecasting:**
    *   Lagged Gradient Forecaster
*   **Interactive controls:**
    *   Select signal type
    *   Play/pause simulation
    *   Adjust playback speed
*   **Canvas-based plotting:**
    *   Displays the generated signal and forecasts in real-time.

## Installation and Usage

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd timeseries-lab
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    This will start the Vite development server, and you can access the application in your browser, usually at `http://localhost:5173`.

## Technologies Used

*   **Frontend:**
    *   Preact: A fast 3kB alternative to React with the same modern API.
    *   TypeScript: For static typing.
    *   Vite: For fast frontend tooling.
*   **Charting:**
    *   HTML Canvas: For custom plotting of time series data.

## Project Structure

*   `public/`: Static assets.
*   `src/`: Frontend source code.
    *   `components/`: Preact components.
    *   `App.tsx`: Main application component.
    *   `main.tsx`: Entry point of the application.
*   `lib/`: Core library for time series generation and forecasting.
    *   `generators/`: Signal generator modules.
    *   `forecasters/`: Forecasting model modules.
    *   `utils/`: Utility modules like `SignalBuffer`.
    *   `types.ts`: TypeScript type definitions.
    *   `index.ts`: Main export file for the library.

## Future Work (TODO)

*   Implement additional forecasters (e.g., ARIMA, Markov Models).
*   Add more signal generator types.
*   Allow users to customize generator and forecaster parameters from the UI.
*   Improve error handling and user feedback.
*   Add unit and integration tests.
*   Enhance visualization options (e.g., zooming, panning, multiple series).
