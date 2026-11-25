<?php
/**
 * License Manager Pro — administrator configuration controller.
 *
 * Saves the component parameters (API URL, API key, signed-requests
 * toggle, default product / cycle) and runs Test connection
 * (GET /system/info). An empty API key field keeps the stored key,
 * so the secret is never wiped by accident and never echoed back.
 */

declare(strict_types=1);

namespace Licensemanagerpro\Component\Licensemanagerpro\Administrator\Controller;

use Joomla\CMS\Component\ComponentHelper;
use Joomla\CMS\Factory;
use Joomla\CMS\Language\Text;
use Joomla\CMS\MVC\Controller\BaseController;
use Joomla\CMS\Router\Route;
use Joomla\CMS\Table\Table;
use Joomla\Registry\Registry;
use Licensemanagerpro\Component\Licensemanagerpro\Administrator\Model\CycleMapper;
use Licensemanagerpro\Component\Licensemanagerpro\Administrator\Model\LicenseModel;
use Throwable;

class ConfigController extends BaseController
{
    public function save(): void
    {
        $this->checkToken();
        $app = Factory::getApplication();
        $input = $app->getInput();

        $apiUrl = rtrim(trim((string) $input->post->getString('api_url', '')), '/');
        $apiKey = trim((string) $input->post->getString('api_key', ''));
        $signed = (int) $input->post->getInt('signed_requests', 0) === 1 ? 1 : 0;
        $productSlug = trim((string) $input->post->getString('default_product_slug', ''));
        $cycle = trim((string) $input->post->getString('default_billing_cycle', ''));

        if ($apiUrl === '') {
            $app->enqueueMessage(Text::_('COM_LICENSMANAGERPRO_ERROR_NO_API_URL'), 'error');
            $this->setRedirect(Route::_('index.php?option=com_licensemanagerpro', false));
            return;
        }
        if ($cycle !== '' && !CycleMapper::isKnownCycle($cycle)) {
            $app->enqueueMessage(Text::_('COM_LICENSMANAGERPRO_ERROR_BAD_CYCLE'), 'error');
            $this->setRedirect(Route::_('index.php?option=com_licensemanagerpro', false));
            return;
        }

        $params = ComponentHelper::getParams('com_licensemanagerpro');
        if ($apiKey !== '') {
            $params->set('api_key', $apiKey);
        }
        $params->set('api_url', $apiUrl);
        $params->set('signed_requests', $signed);
        $params->set('default_product_slug', $productSlug);
        $params->set('default_billing_cycle', $cycle);
        $this->storeParams($params);

        $app->enqueueMessage(Text::_('COM_LICENSMANAGERPRO_CONFIG_SAVED'), 'message');
        $this->setRedirect(Route::_('index.php?option=com_licensemanagerpro', false));
    }

    /** Test connection: GET /system/info through the API client. */
    public function test(): void
    {
        $this->checkToken();
        $app = Factory::getApplication();
        try {
            $info = (new LicenseModel())->testConnection();
            $version = $info['version'] ?? null;
            $app->enqueueMessage(
                $version !== null
                    ? Text::sprintf('COM_LICENSMANAGERPRO_TEST_OK_VERSION', $version)
                    : Text::_('COM_LICENSMANAGERPRO_TEST_OK'),
                'message'
            );
        } catch (Throwable $e) {
            $app->enqueueMessage(
                Text::sprintf('COM_LICENSMANAGERPRO_TEST_FAILED', $e->getMessage()),
                'error'
            );
        }
        $this->setRedirect(Route::_('index.php?option=com_licensemanagerpro', false));
    }

    private function storeParams(Registry $params): void
    {
        $table = Table::getInstance('Extension');
        $table->load(['element' => 'com_licensemanagerpro', 'type' => 'component']);
        $table->params = $params->toString();
        $table->store();
    }
}
