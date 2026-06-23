"""成果发送：本批只做渠道探测和发送预览，不真实外发。"""
from fastapi import APIRouter, HTTPException

from .. import schemas
from ..config import settings

router = APIRouter(prefix="/api/result-send", tags=["result-send"])

_CHANNELS = {
    "email": ("邮件", "result_send_email_configured"),
    "wecom": ("企业微信", "result_send_wecom_configured"),
    "wx": ("个人微信", "result_send_wx_configured"),
}


def _configured(channel: str) -> bool:
    if channel not in _CHANNELS:
        raise HTTPException(status_code=400, detail="未知发送渠道")
    return bool(getattr(settings, _CHANNELS[channel][1]))


@router.get("/channels", response_model=schemas.ResultSendChannelsOut)
def channels() -> schemas.ResultSendChannelsOut:
    return schemas.ResultSendChannelsOut(
        items=[
            schemas.ResultSendChannelOut(
                channel=channel,
                configured=_configured(channel),
                label=label,
            )
            for channel, (label, _key) in _CHANNELS.items()
        ]
    )


@router.post("/preview", response_model=schemas.ResultSendPreviewOut)
def preview(payload: schemas.ResultSendPreviewIn) -> schemas.ResultSendPreviewOut:
    channel = payload.channel.strip()
    if not _configured(channel):
        return schemas.ResultSendPreviewOut(status="not_configured", channel=channel)
    label = _CHANNELS[channel][0]
    rendered = f"【{label}发送预览】\n\n{payload.content.strip()}"
    return schemas.ResultSendPreviewOut(status="preview", channel=channel, rendered=rendered)
