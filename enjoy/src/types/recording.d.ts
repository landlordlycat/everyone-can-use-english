type RecordingType = {
  id: string;
  filename: string;
  target?: AudioType | (MessageType & any);
  targetId: string;
  targetType: string;
  pronunciationAssessment?: PronunciationAssessmentType & any;
  segmentIndex: number;
  segmentText?: string;
  duration?: number;
  src?: string;
  md5: string;
  uploadedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

type SegementRecordingStatsType = {
  targetId: string;
  targetType: string;
  referenceId: number;
  referenceText?: string;
  count: number;
  duration: number;
}[];
