export declare class KaldiFbank {
    private buffer;
    private stored;
    private sampleOffset;
    private framesProduced;
    private trueLength;
    private readonly samples;
    private readonly fftRe;
    private readonly fftIm;
    acceptWaveform(samples: ArrayLike<number>): Float32Array[];
    inputFinished(): Float32Array[];
    reset(): void;
    private append;
    private trim;
    private computeFrame;
}
