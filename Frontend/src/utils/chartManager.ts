/**
 * Olivia: Decentralised Permissionless Predicition Market 
 * Copyright (c) 2025 Ayush Srivastava
 *
 * Licensed under the Apache 2.0
 */

import {
  LineSeries,
  HistogramSeries,
  ColorType,
  createChart as createLightWeightChart,
  CrosshairMode,
  ISeriesApi,
  UTCTimestamp,
  IChartApi,
} from 'lightweight-charts';

export class ChartManager {
  private priceSeries: ISeriesApi<'Line'>;
  private volumeSeries: ISeriesApi<'Histogram'>;
  private lastUpdateTime: number = 0;
  private chart: IChartApi | null;
  private isDisposed: boolean = false;
  private currentBar: {
    close: number | null;
    volume: number | null;
  } = {
    close: null,
    volume: null,
  };
  private initialPrice: number | null = null;
  private lastPrice: number | null = null;

  constructor(
    ref: HTMLDivElement,
    initialData: { timestamp: number; close: number; volume: number }[],
    layout: { background: string; color: string }
  ) {
    console.log('chart data: ', initialData);
    const chart = createLightWeightChart(ref, {
      autoSize: true,
      overlayPriceScales: {
        ticksVisible: true,
        borderVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          width: 1,
          color: 'rgba(224, 224, 224, 0.5)',
          style: 2, // dashed
        },
        horzLine: {
          width: 1,
          color: 'rgba(224, 224, 224, 0.5)',
          style: 2, // dashed
        },
      },
      rightPriceScale: {
        visible: true,
        borderVisible: false,
        ticksVisible: true,
        entireTextOnly: true,
      },
      timeScale: {
        borderVisible: false,
        tickMarkFormatter: (time: UTCTimestamp) => {
          const date = new Date(time * 1000);
          return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
        },
      },
      grid: {
        horzLines: {
          color: 'rgba(197, 203, 206, 0.1)',
          visible: true,
        },
        vertLines: {
          color: 'rgba(197, 203, 206, 0.1)',
          visible: true,
        },
      },
      layout: {
        background: {
          type: ColorType.Solid,
          color: layout.background,
        },
        textColor: 'rgba(255, 255, 255, 0.7)',
        fontSize: 12,
      },
    });
    this.chart = chart;

    // Price Series - will be set to green/red based on price trend
    this.priceSeries = chart.addSeries(LineSeries, {
      color: '#26A69A', // Default green (will be updated based on trend)
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: 'rgba(38, 166, 154, 1)',
      crosshairMarkerBackgroundColor: 'rgba(38, 166, 154, 1)',
    });
    this.priceSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.1,
        bottom: 0.3,
      },
      borderVisible: false,
    });

    // Volume Series
    this.volumeSeries = chart.addSeries(HistogramSeries, {
      color: 'rgba(38, 166, 154, 0.5)', // Soft green with transparency
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });
    this.volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.9,
        bottom: 0,
      },
      borderVisible: false,
    });

    // Sort data by timestamp and ensure unique timestamps
    const sortedData = [...initialData].sort((a, b) => a.timestamp - b.timestamp);
    
    // Deduplicate timestamps by keeping the last value for each unique timestamp (in seconds)
    const uniqueDataMap = new Map<number, typeof initialData[0]>();
    sortedData.forEach((data) => {
      const timeInSeconds = Math.floor(data.timestamp / 1000);
      uniqueDataMap.set(timeInSeconds, data);
    });
    
    const deduplicatedData = Array.from(uniqueDataMap.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );

    // Determine overall trend for initial color (first price vs last price)
    if (deduplicatedData.length > 0) {
      this.initialPrice = deduplicatedData[0].close;
      this.lastPrice = deduplicatedData[deduplicatedData.length - 1].close;
      
      // Update line color based on price trend (green for up, red for down)
      const isPriceUp = this.lastPrice >= this.initialPrice;
      const lineColor = isPriceUp ? '#26A69A' : '#EF5350'; // Green for up, Red for down
      const markerColor = isPriceUp ? 'rgba(38, 166, 154, 1)' : 'rgba(239, 83, 80, 1)';
      
      this.priceSeries.applyOptions({
        color: lineColor,
        crosshairMarkerBorderColor: markerColor,
        crosshairMarkerBackgroundColor: markerColor,
      });
    }

    // Set initial data
    const priceData = deduplicatedData.map((data) => ({
      time: Math.floor(data.timestamp / 1000) as UTCTimestamp,
      value: data.close,
    }));

    const volumeData = deduplicatedData.map((data, index) => ({
      time: Math.floor(data.timestamp / 1000) as UTCTimestamp,
      value: data.volume,
      color:
        index > 0 && data.close >= deduplicatedData[index - 1].close
          ? 'rgba(38, 166, 154, 0.5)' // Green with transparency
          : 'rgba(239, 83, 80, 0.5)', // Red with transparency
    }));

    this.priceSeries.setData(priceData);
    this.volumeSeries.setData(volumeData);

    // Initialize lastUpdateTime with the last data point timestamp
    if (deduplicatedData.length > 0) {
      this.lastUpdateTime = deduplicatedData[deduplicatedData.length - 1].timestamp;
    }

    // Fit content and add margin
    chart.timeScale().fitContent();
  }

  public update(
    updatedPrice: {
      time: number;
      close: number;
      volume: number;
      newCandleInitiated?: boolean;
    }
  ) {
    if (this.isDisposed || !this.chart) {
      console.warn('Attempted to update a disposed chart');
      return;
    }

    // Ensure timestamp is not older than the last update
    // Lightweight-charts requires updates to be newer than existing data
    if (this.lastUpdateTime && updatedPrice.time <= this.lastUpdateTime) {
      console.debug('Skipping update: timestamp not newer than last update', {
        newTime: updatedPrice.time,
        lastTime: this.lastUpdateTime,
      });
      return;
    }

    // Convert time from milliseconds to seconds for UTCTimestamp
    const timeInSeconds = Math.floor(updatedPrice.time / 1000) as UTCTimestamp;

    try {
      // Determine price direction and update line color dynamically
      if (this.currentBar.close !== null) {
        const isPriceUp = updatedPrice.close >= this.currentBar.close;
        const lineColor = isPriceUp ? '#26A69A' : '#EF5350'; // Green for up, Red for down
        const markerColor = isPriceUp ? 'rgba(38, 166, 154, 1)' : 'rgba(239, 83, 80, 1)';
        
        // Update line color based on price movement
        this.priceSeries.applyOptions({
          color: lineColor,
          crosshairMarkerBorderColor: markerColor,
          crosshairMarkerBackgroundColor: markerColor,
        });
      } else if (this.initialPrice !== null) {
        // Compare with initial price if no current bar
        const isPriceUp = updatedPrice.close >= this.initialPrice;
        const lineColor = isPriceUp ? '#26A69A' : '#EF5350';
        const markerColor = isPriceUp ? 'rgba(38, 166, 154, 1)' : 'rgba(239, 83, 80, 1)';
        
        this.priceSeries.applyOptions({
          color: lineColor,
          crosshairMarkerBorderColor: markerColor,
          crosshairMarkerBackgroundColor: markerColor,
        });
      }

      // Update price series
      this.priceSeries.update({
        time: timeInSeconds,
        value: updatedPrice.close,
      });

      // Update volume series
      this.volumeSeries.update({
        time: timeInSeconds,
        value: updatedPrice.volume,
        color:
          updatedPrice.close >= (this.currentBar.close || 0)
            ? 'rgba(38, 166, 154, 0.5)' // Green with transparency
            : 'rgba(239, 83, 80, 0.5)', // Red with transparency
      });

      // Update current bar
      this.currentBar = {
        close: updatedPrice.close,
        volume: updatedPrice.volume,
      };
      
      // Track last price for trend calculation
      this.lastPrice = updatedPrice.close;

      // Update lastUpdateTime for tracking
      this.lastUpdateTime = updatedPrice.time;
    } catch (error) {
      console.error('Error updating chart:', error);
    }
  }

  public destroy() {
    if (this.isDisposed || !this.chart) {
      console.debug('Chart already disposed or null');
      return;
    }

    try {
      this.chart.remove();
      this.chart = null;
      this.isDisposed = true;
    } catch (error) {
      console.error('Error while destroying chart:', error);
    }
  }
}
